import { readFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"

import { Effect, Fiber, Option, Stream } from "effect"

import { Diagnostics } from "../diagnostics/service.ts"
import type { ServerStatus, SupervisorEvent } from "../domain.ts"
import { GitConnection } from "../git/connection.ts"
import { parseRemote } from "../git/remote.ts"
import { Repository } from "../git/repository.ts"
import { atLeast, type Role } from "../accounts.ts"
import { readArgusFile, writeArgusFile, type ArgusFile, type PanelSettings } from "../home.ts"
import { Supervisor } from "../supervisor.ts"
import { HttpError, readBody, send, type Handler, type RequestContext } from "./host.ts"

const HISTORY_LINES = 1000
const KEEP_ALIVE_MS = 15_000
const MAX_CLIENTS_PATTERN = /^\s*sv_maxclients\s+(\d+)/m

const COMMAND_ROLES: Record<string, Role> = {
  status: "moderator",
  say: "moderator",
  clientkick: "moderator",
  set: "owner",
  exec: "owner",
  quit: "owner",
  sv_licensekey: "owner",
  rcon_password: "owner"
}

const requireRole = (context: RequestContext, role: Role) => {
  if (context.account && !atLeast(context.account, role)) {
    throw new HttpError(403, `Only ${role === "owner" ? "the owner" : `${role}s`} can do this`)
  }
}

const maxPlayersOf = (settings: PanelSettings) => {
  try {
    const match = MAX_CLIENTS_PATTERN.exec(readFileSync(join(settings.dataFolder, settings.configFile), "utf8"))
    return match?.[1] === undefined ? null : Number(match[1])
  } catch {
    return null
  }
}

export interface ApiOptions {
  readonly home: string
  readonly version: string
}

export const makeApiHandler = (options: ApiOptions) =>
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

    const handle: Handler = async (request: IncomingMessage, response: ServerResponse, route: string, context: RequestContext) => {
      switch (route) {
        case "GET /setup":
          send(response, 200, { configured: true })
          return true
        case "GET /state":
          send(response, 200, await state())
          return true
        case "GET /events":
          events(request, response)
          return true
        case "POST /server/start":
          requireRole(context, "admin")
          await run(supervisor.start)
          send(response, 202, { ok: true })
          return true
        case "POST /server/stop":
          requireRole(context, "admin")
          await run(supervisor.stop)
          send(response, 202, { ok: true })
          return true
        case "POST /server/restart":
          requireRole(context, "admin")
          await run(supervisor.restart)
          send(response, 202, { ok: true })
          return true
        case "POST /command": {
          const body = await readBody(request)
          const command = typeof body.command === "string" ? body.command.trim() : ""
          if (!command) throw new HttpError(400, "Send a command")
          requireRole(context, COMMAND_ROLES[command.split(/\s+/)[0]?.toLowerCase() ?? ""] ?? "admin")
          const result = await run(Effect.result(supervisor.send(command)))
          if (result._tag === "Failure") throw new HttpError(409, `Server is ${result.failure.status}`)
          send(response, 202, { ok: true })
          return true
        }
        case "GET /problems":
          send(response, 200, await run(diagnostics.problems))
          return true
        case "GET /settings":
          send(response, 200, loadFile().settings)
          return true
        case "PUT /settings": {
          requireRole(context, "owner")
          const body = await readBody(request)
          const file = loadFile()
          const next = { ...file.settings, ...(body as Partial<PanelSettings>) }
          writeArgusFile({ ...file, settings: next }, options.home)
          send(response, 200, next)
          return true
        }
        case "GET /git":
          send(response, 200, await gitState())
          return true
        case "POST /git/key": {
          requireRole(context, "owner")
          const file = loadFile()
          const key = await run(Effect.result(connection.deployKey(`argus-${file.settings.name}`)))
          if (key._tag === "Failure") throw new HttpError(500, key.failure.message)
          send(response, 200, { publicKey: key.success.publicKey, fingerprint: key.success.fingerprint })
          return true
        }
        case "POST /git/test": {
          requireRole(context, "owner")
          const body = await readBody(request)
          const remote = typeof body.url === "string" ? parseRemote(body.url) : undefined
          if (!remote) throw new HttpError(400, "That is not a repository link")
          const file = loadFile()
          const result = await run(Effect.result(connection.test(remote.sshUrl, `argus-${file.settings.name}`)))
          if (result._tag === "Success") {
            send(response, 200, { ok: true, remote, branches: result.success })
            return true
          }
          const failure = result.failure
          send(response, 200, {
            ok: false,
            remote,
            reason: failure._tag === "ConnectionRefused" ? failure.reason : "unknown",
            detail: failure._tag === "ConnectionRefused" ? failure.detail : failure.message
          })
          return true
        }
        case "PUT /git": {
          requireRole(context, "owner")
          const body = await readBody(request)
          const file = loadFile()
          if (body.url === null) {
            writeArgusFile({ ...file, repository: null }, options.home)
            send(response, 200, { connected: false })
            return true
          }
          const remote = typeof body.url === "string" ? parseRemote(body.url) : undefined
          const branch = typeof body.branch === "string" && body.branch.trim() ? body.branch.trim() : undefined
          if (!remote || !branch) throw new HttpError(400, "Send a repository link and a branch")
          writeArgusFile({ ...file, repository: { url: remote.sshUrl, branch } }, options.home)
          send(response, 200, await gitState())
          return true
        }
        default:
          return false
      }
    }

    return handle
  })

