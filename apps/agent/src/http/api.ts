import { timingSafeEqual } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { join } from "node:path"

import { Context, Effect, Fiber, Layer, Option, Stream } from "effect"

import { Diagnostics } from "../diagnostics/service.ts"
import type { ServerStatus, SupervisorEvent } from "../domain.ts"
import { GitConnection } from "../git/connection.ts"
import { parseRemote } from "../git/remote.ts"
import { Repository } from "../git/repository.ts"
import { readArgusFile, writeArgusFile, type ArgusFile, type PanelSettings } from "../home.ts"
import { Supervisor } from "../supervisor.ts"

const MAX_BODY_BYTES = 64 * 1024
const HISTORY_LINES = 1000
const KEEP_ALIVE_MS = 15_000
const MAX_CLIENTS_PATTERN = /^\s*sv_maxclients\s+(\d+)/m

const maxPlayersOf = (settings: PanelSettings) => {
  try {
    const match = MAX_CLIENTS_PATTERN.exec(readFileSync(join(settings.dataFolder, settings.configFile), "utf8"))
    return match?.[1] === undefined ? null : Number(match[1])
  } catch {
    return null
  }
}

export interface ApiOptions {
  readonly port: number
  readonly token: string
  readonly home: string
  readonly version: string
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  response.end(JSON.stringify(body))
}

const readBody = (request: IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Array<Buffer> = []
    let size = 0
    request.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Body too large"))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on("end", () => {
      if (size === 0) return resolve({})
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object")
        resolve(parsed as Record<string, unknown>)
      } catch {
        reject(new HttpError(400, "Body must be a JSON object"))
      }
    })
    request.on("error", reject)
  })

const authorized = (request: IncomingMessage, token: string) => {
  const header = request.headers.authorization ?? ""
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "")
  const expected = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const make = (options: ApiOptions) =>
  Effect.gen(function*() {
    const supervisor = yield* Supervisor
    const diagnostics = yield* Diagnostics
    const repository = yield* Repository
    const connection = yield* GitConnection
    const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

    let onlineSince: number | null = null
    yield* supervisor.events.pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => {
          if (event._tag !== "StatusChanged") return
          if (event.status === "online") onlineSince = event.time
          else if (event.status !== "restarting") onlineSince = null
        })
      ),
      Effect.forkScoped
    )

    const loadFile = (): ArgusFile => {
      const file = readArgusFile(options.home)
      if (!file) throw new HttpError(500, "Argus is not set up. Run argus init.")
      return file
    }

    const state = async () => {
      const file = loadFile()
      const [status, pid, players, history, problems] = await Promise.all([
        run(supervisor.status),
        run(supervisor.pid),
        run(supervisor.players),
        run(supervisor.history),
        run(diagnostics.problems)
      ])
      return {
        version: options.version,
        name: file.settings.name,
        status: status satisfies ServerStatus,
        pid: Option.getOrNull(pid),
        players,
        maxPlayers: maxPlayersOf(file.settings),
        onlineSince,
        lines: history.slice(-HISTORY_LINES),
        problems
      }
    }

    const liveEvents = () => {
      const since = Date.now() - 1000
      return supervisor.events.pipe(Stream.filter((event) => event._tag !== "Line" || event.line.time >= since))
    }

    const events = (request: IncomingMessage, response: ServerResponse) => {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
        "x-accel-buffering": "no"
      })
      response.write("retry: 2000\n\n")
      const write = (type: string, data: unknown) => Effect.sync(() => void response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
      const fromSupervisor = (event: SupervisorEvent) => {
        switch (event._tag) {
          case "Line":
            return write("line", event.line)
          case "StatusChanged":
            return write("status", { status: event.status, time: event.time, pid: event.pid ?? null, onlineSince })
          case "PlayersChanged":
            return write("players", { players: event.players })
          case "Incident":
            return Effect.void
        }
      }
      const fibers = [
        Effect.runFork(Stream.runForEach(liveEvents(), fromSupervisor)),
        Effect.runFork(Stream.runForEach(diagnostics.changes, (problem) => write("problem", problem)))
      ]
      const keepAlive = setInterval(() => response.write(": ping\n\n"), KEEP_ALIVE_MS)
      request.on("close", () => {
        clearInterval(keepAlive)
        for (const fiber of fibers) Effect.runFork(Fiber.interrupt(fiber))
      })
    }

    const gitState = async () => {
      const file = loadFile()
      if (!file.repository) return { connected: false }
      const [head, drift, branches] = await Promise.all([run(repository.head), run(repository.drift), run(repository.branches)])
      return {
        connected: true,
        repository: file.repository,
        remote: parseRemote(file.repository.url) ?? null,
        head: Option.getOrNull(head),
        drift,
        branches
      }
    }

    const handle = async (request: IncomingMessage, response: ServerResponse) => {
      const url = new URL(request.url ?? "/", "http://localhost")
      const route = `${request.method ?? "GET"} ${url.pathname}`
      if (route === "GET /api/health") return send(response, 200, { ok: true, version: options.version })
      if (!authorized(request, options.token)) throw new HttpError(401, "Missing or wrong token")

      switch (route) {
        case "GET /api/state":
          return send(response, 200, await state())
        case "GET /api/events":
          return events(request, response)
        case "POST /api/server/start":
          await run(supervisor.start)
          return send(response, 202, { ok: true })
        case "POST /api/server/stop":
          await run(supervisor.stop)
          return send(response, 202, { ok: true })
        case "POST /api/server/restart":
          await run(supervisor.restart)
          return send(response, 202, { ok: true })
        case "POST /api/command": {
          const body = await readBody(request)
          const command = typeof body.command === "string" ? body.command.trim() : ""
          if (!command) throw new HttpError(400, "Send a command")
          const result = await run(Effect.result(supervisor.send(command)))
          if (result._tag === "Failure") throw new HttpError(409, `Server is ${result.failure.status}`)
          return send(response, 202, { ok: true })
        }
        case "GET /api/problems":
          return send(response, 200, await run(diagnostics.problems))
        case "GET /api/settings":
          return send(response, 200, loadFile().settings)
        case "PUT /api/settings": {
          const body = await readBody(request)
          const file = loadFile()
          const next = { ...file.settings, ...(body as Partial<PanelSettings>) }
          writeArgusFile({ ...file, settings: next }, options.home)
          return send(response, 200, next)
        }
        case "GET /api/git":
          return send(response, 200, await gitState())
        case "POST /api/git/key": {
          const file = loadFile()
          const key = await run(Effect.result(connection.deployKey(`argus-${file.settings.name}`)))
          if (key._tag === "Failure") throw new HttpError(500, key.failure.message)
          return send(response, 200, { publicKey: key.success.publicKey, fingerprint: key.success.fingerprint })
        }
        case "POST /api/git/test": {
          const body = await readBody(request)
          const remote = typeof body.url === "string" ? parseRemote(body.url) : undefined
          if (!remote) throw new HttpError(400, "That is not a repository link")
          const file = loadFile()
          const result = await run(Effect.result(connection.test(remote.sshUrl, `argus-${file.settings.name}`)))
          if (result._tag === "Success") return send(response, 200, { ok: true, remote, branches: result.success })
          const failure = result.failure
          return send(response, 200, {
            ok: false,
            remote,
            reason: failure._tag === "ConnectionRefused" ? failure.reason : "unknown",
            detail: failure._tag === "ConnectionRefused" ? failure.detail : failure.message
          })
        }
        case "PUT /api/git": {
          const body = await readBody(request)
          const file = loadFile()
          if (body.url === null) {
            writeArgusFile({ ...file, repository: null }, options.home)
            return send(response, 200, { connected: false })
          }
          const remote = typeof body.url === "string" ? parseRemote(body.url) : undefined
          const branch = typeof body.branch === "string" && body.branch.trim() ? body.branch.trim() : undefined
          if (!remote || !branch) throw new HttpError(400, "Send a repository link and a branch")
          writeArgusFile({ ...file, repository: { url: remote.sshUrl, branch } }, options.home)
          return send(response, 200, await gitState())
        }
        default:
          throw new HttpError(404, "Not found")
      }
    }

    const server = createServer((request, response) => {
      handle(request, response).catch((error: unknown) => {
        if (response.headersSent) return response.end()
        if (error instanceof HttpError) return send(response, error.status, { error: error.message })
        return send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" })
      })
    })

    yield* Effect.acquireRelease(
      Effect.callback<void, Error>((resume) => {
        server.once("error", (error) => resume(Effect.fail(error)))
        server.listen(options.port, "127.0.0.1", () => resume(Effect.void))
      }),
      () =>
        Effect.callback<void>((resume) => {
          server.closeAllConnections()
          server.close(() => resume(Effect.void))
        })
    )

    return { port: options.port }
  })

export class AgentApi extends Context.Service<AgentApi, { readonly port: number }>()("argus/agent/AgentApi") {
  static readonly layer = (options: ApiOptions) => Layer.effect(AgentApi, make(options))
}
