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
import { ArtifactError, Artifacts, buildOfExecutable, type Channel } from "../artifacts.ts"
import { DeployError, deployKeyPath, GitDeploy } from "../git/deploy.ts"
import { latestRelease } from "../version.ts"
import { Moderation, ModerationError, type OnlinePlayer } from "../moderation.ts"
import { scanResources } from "../resources.ts"
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
          case "Telemetry":
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

    const resourcesFolder = () => {
      const file = readArgusFile(options.home)
      return file ? join(file.settings.dataFolder, "resources") : undefined
    }
    const sendCommand = (text: string) =>
      run(Effect.result(supervisor.send(text))).then((result) => {
        if (result._tag === "Failure") throw new HttpError(409, `Server is ${result.failure.status}`)
      })
    const moderation = new Moderation(
      options.home,
      () => {
        const folder = resourcesFolder()
        return folder ? join(folder, "[argus]", "argus", "bans.json") : undefined
      },
      () => readArgusFile(options.home)?.settings.banMessage ?? "You are banned from this server.",
      sendCommand
    )
    const deploy = new GitDeploy(resourcesFolder, () => deployKeyPath(options.home), () => readArgusFile(options.home)?.repository?.url)
    const resourceStates = new Map<string, string>()
    const artifacts = new Artifacts(options.home)

    yield* supervisor.events.pipe(
      Stream.runForEach((event) =>
        Effect.promise(async () => {
          if (event._tag === "StatusChanged") {
            if (event.status === "online") await moderation.publish().catch(() => undefined)
            if (event.status === "offline" || event.status === "restarting") {
              moderation.onOffline()
              resourceStates.clear()
            }
            return
          }
          if (event._tag !== "Telemetry") return
          const data = event.data as { list?: unknown }
          if (event.kind === "players" && Array.isArray(data.list)) moderation.onPlayers(data.list as Array<OnlinePlayer>, event.time)
          if (event.kind === "resources" && Array.isArray(data.list)) {
            resourceStates.clear()
            for (const entry of data.list as Array<{ name?: unknown; state?: unknown }>) {
              if (typeof entry.name === "string" && typeof entry.state === "string") resourceStates.set(entry.name, entry.state)
            }
          }
        })
      ),
      Effect.forkScoped
    )

    const actor = (context: RequestContext) => context.account?.username ?? "argus"
    const guard = async (work: () => Promise<unknown>) => {
      try {
        return await work()
      } catch (error) {
        if (error instanceof ModerationError || error instanceof DeployError || error instanceof ArtifactError) throw new HttpError(error.status, error.message)
        throw error
      }
    }

    const deployState = async () => {
      const file = readArgusFile(options.home)
      const isRepository = await deploy.isRepository()
      if (!isRepository) return { repository: false, connected: Boolean(file?.repository), branch: file?.repository?.branch ?? null }
      const branch = await deploy.currentBranch()
      const [head, commits, drift] = await Promise.all([deploy.head(), deploy.log("HEAD", 25), run(repository.drift)])
      return { repository: true, connected: Boolean(file?.repository), branch, head, commits, drift, wanted: file?.repository?.branch ?? null }
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
        case "GET /players":
          send(response, 200, moderation.players(Date.now()))
          return true
        case "POST /players/warn":
        case "POST /players/kick":
        case "POST /players/ban":
        case "POST /players/unban":
        case "POST /players/note":
        case "POST /players/message": {
          const action = route.slice("POST /players/".length)
          requireRole(context, action === "unban" ? "admin" : "moderator")
          const body = await readBody(request)
          const key = typeof body.key === "string" ? body.key : ""
          const text = typeof body.reason === "string" ? body.reason : typeof body.text === "string" ? body.text : ""
          const now = Date.now()
          await guard(async () => {
            if (action === "warn") await moderation.warn(actor(context), key, text, now)
            if (action === "kick") await moderation.kick(actor(context), key, text, now)
            if (action === "ban") await moderation.ban(actor(context), key, text, typeof body.duration === "string" ? body.duration : "", body.includeLinked === true, now)
            if (action === "unban") await moderation.unban(actor(context), key, text || "Ban revoked", now)
            if (action === "note") moderation.note(actor(context), key, text, now)
            if (action === "message") await moderation.message(actor(context), key, text)
          })
          send(response, 200, { ok: true })
          return true
        }
        case "GET /bans":
          send(response, 200, moderation.bans(Date.now()))
          return true
        case "POST /bans": {
          requireRole(context, "moderator")
          const body = await readBody(request)
          await guard(() =>
            moderation.banIdentifier(actor(context), typeof body.identifier === "string" ? body.identifier : "", typeof body.reason === "string" ? body.reason : "", typeof body.duration === "string" ? body.duration : "", Date.now())
          )
          send(response, 200, { ok: true })
          return true
        }
        case "POST /bans/revoke": {
          requireRole(context, "admin")
          const body = await readBody(request)
          await guard(() => moderation.revoke(actor(context), typeof body.id === "string" ? body.id : "", typeof body.reason === "string" ? body.reason : "", Date.now()))
          send(response, 200, { ok: true })
          return true
        }
        case "GET /resources": {
          const entries = scanResources(resourcesFolder())
          send(
            response,
            200,
            entries.map((entry) => ({ ...entry, state: resourceStates.get(entry.name) ?? (resourceStates.size ? "stopped" : "unknown") }))
          )
          return true
        }
        case "GET /deploys":
          send(response, 200, await guard(deployState))
          return true
        case "POST /deploys/fetch": {
          requireRole(context, "admin")
          const result = await guard(async () => {
            const branch = await deploy.currentBranch()
            await deploy.fetch(branch)
            const incoming = await deploy.log(`HEAD..origin/${branch}`, 50)
            const changes = incoming.length ? await deploy.changes(`HEAD..origin/${branch}`) : []
            return { branch, incoming, changes }
          })
          send(response, 200, result)
          return true
        }
        case "POST /deploys/apply": {
          requireRole(context, "admin")
          const body = await readBody(request)
          await guard(async () => {
            const drift = await run(repository.drift)
            if (drift.some((entry) => entry.state !== "untracked") && body.force !== true) {
              throw new DeployError(409, "Some files were edited on the server. Discard or commit them first.")
            }
            await deploy.fastForward(await deploy.currentBranch())
          })
          if (body.restart === true) await run(supervisor.restart)
          send(response, 200, await guard(deployState))
          return true
        }
        case "POST /deploys/branch": {
          requireRole(context, "owner")
          const body = await readBody(request)
          const name = typeof body.name === "string" ? body.name.trim() : ""
          if (!/^[\w./-]+$/.test(name)) throw new HttpError(400, "Pick a branch")
          await guard(async () => {
            const drift = await run(repository.drift)
            if (drift.some((entry) => entry.state !== "untracked")) throw new DeployError(409, "Some files were edited on the server. Discard or commit them first.")
            await deploy.switchBranch(name)
          })
          const file = readArgusFile(options.home)
          if (file?.repository) writeArgusFile({ ...file, repository: { ...file.repository, branch: name } }, options.home)
          send(response, 200, await guard(deployState))
          return true
        }
        case "GET /version":
          send(response, 200, await latestRelease())
          return true
        case "GET /artifacts": {
          requireRole(context, "admin")
          const file = loadFile()
          const current = buildOfExecutable(file.settings.executable)
          const channels = await artifacts.channels().catch((error: unknown) => ({ error: error instanceof Error ? error.message : "unreachable" }))
          send(response, 200, {
            current,
            executable: file.settings.executable,
            managed: file.settings.executable.startsWith(artifacts.folder),
            channels: Array.isArray(channels) ? channels.map(({ channel, build }) => ({ channel, build })) : [],
            channelsError: Array.isArray(channels) ? null : channels.error,
            installed: artifacts.installed().map(({ build, installedAt }) => ({ build, installedAt })),
            job: artifacts.status() ?? null
          })
          return true
        }
        case "POST /artifacts/install": {
          requireRole(context, "owner")
          const body = await readBody(request)
          const channel = body.channel
          if (channel !== "recommended" && channel !== "latest" && channel !== "optional" && channel !== "critical") throw new HttpError(400, "Pick a channel")
          send(response, 202, await guard(() => artifacts.install(channel as Channel)))
          return true
        }
        case "POST /artifacts/use": {
          requireRole(context, "owner")
          const body = await readBody(request)
          const build = typeof body.build === "string" ? body.build : ""
          if (!artifacts.installed().some((entry) => entry.build === build)) throw new HttpError(404, "That build is not installed")
          const file = loadFile()
          writeArgusFile({ ...file, settings: { ...file.settings, executable: artifacts.executableFor(build) } }, options.home)
          if (body.restart === true) await run(supervisor.restart)
          send(response, 200, { ok: true, executable: artifacts.executableFor(build) })
          return true
        }
        case "POST /artifacts/remove": {
          requireRole(context, "owner")
          const body = await readBody(request)
          const file = loadFile()
          await guard(async () => artifacts.remove(typeof body.build === "string" ? body.build : "", buildOfExecutable(file.settings.executable)))
          send(response, 200, { ok: true })
          return true
        }
        case "GET /deploys/branches":
          send(response, 200, await guard(() => deploy.branches()))
          return true
        default:
          return false
      }
    }

    return handle
  })

