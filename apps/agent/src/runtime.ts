import { execFile } from "node:child_process"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Console, Deferred, Duration, Effect, Layer, Schedule, Stream } from "effect"

import { FAKE_RESOURCES_FOLDER, FAKE_SERVER_SCRIPT, isPackaged, panelAvailable } from "./assets.ts"
import { ServerConfig } from "./config.ts"
import { Diagnostics } from "./diagnostics/service.ts"
import { SourceLocator } from "./diagnostics/source-locator.ts"
import { GitConnection } from "./git/connection.ts"
import { Repository } from "./git/repository.ts"
import { DEFAULT_PANEL_PORT, readArgusFile, toServerSettings, type ArgusFile } from "./home.ts"
import { makeApiHandler } from "./http/api.ts"
import { startHost, type HttpHost } from "./http/host.ts"
import { makeSetupHandler } from "./http/setup.ts"
import { Supervisor } from "./supervisor.ts"

export const VERSION = "0.1.0"

export const FAKE_SERVER_ENV = "ARGUS_RUN_FAKE_FXSERVER"

const SCHEDULE_TICK = Duration.seconds(20)

const DIM = "\u001b[2m"
const BOLD = "\u001b[1m"
const RESET = "\u001b[0m"

export interface StartOptions {
  readonly home: string
  readonly simulate: boolean
  readonly open: boolean
  readonly verbose: boolean
}

const serverLayer = (file: ArgusFile, options: StartOptions) => {
  if (!options.simulate) return ServerConfig.layer(toServerSettings(file.settings, options.home))
  return ServerConfig.layer({
    ...toServerSettings(file.settings, options.home),
    executable: process.execPath,
    args: isPackaged ? [] : [FAKE_SERVER_SCRIPT],
    cwd: undefined,
    env: { FAKE_HEARTBEAT_MS: "1000", ...(isPackaged ? { [FAKE_SERVER_ENV]: "1" } : {}) },
    resourcesPath: file.settings.dataFolder ? join(file.settings.dataFolder, "resources") : FAKE_RESOURCES_FOLDER
  })
}

const clock = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`

const minus = (time: string, minutes: number) => {
  const total = (Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) - minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

const scheduler = (options: StartOptions) =>
  Effect.gen(function*() {
    const supervisor = yield* Supervisor
    const fired = new Set<string>()
    yield* Effect.gen(function*() {
      const file = readArgusFile(options.home)
      if (!file) return
      const now = new Date()
      const minute = clock(now)
      const day = now.toDateString()
      for (const time of file.settings.restartTimes) {
        for (const warning of file.settings.restartWarnings) {
          const key = `${day} ${time} -${warning}`
          if (minus(time, warning) !== minute || fired.has(key)) continue
          fired.add(key)
          yield* Effect.ignore(supervisor.send(`say Server restarts in ${warning} ${warning === 1 ? "minute" : "minutes"}`))
        }
        const key = `${day} ${time}`
        if (time !== minute || fired.has(key)) continue
        fired.add(key)
        if ((yield* supervisor.status) === "online") yield* supervisor.restart
      }
    }).pipe(Effect.repeat({ schedule: Schedule.spaced(SCHEDULE_TICK) }), Effect.forkScoped)
  })

export const openBrowser = (url: string) => {
  const [command, args] = process.platform === "win32"
    ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin"
    ? ["open", [url]]
    : ["xdg-open", [url]]
  execFile(command, args, { windowsHide: true }, () => undefined)
}

const runServer = (host: HttpHost, file: ArgusFile, options: StartOptions) =>
  Effect.gen(function*() {
    const supervisor = yield* Supervisor
    yield* Diagnostics
    host.use(yield* makeApiHandler({ home: options.home, version: VERSION }), file.token)
    yield* scheduler(options)
    yield* supervisor.events.pipe(
      Stream.runForEach((event) => {
        if (event._tag === "StatusChanged") return Console.log(`${DIM}[argus]${RESET} server ${event.status}`)
        if (event._tag === "Incident") return Console.log(`${DIM}[argus]${RESET} ${event.incident.message}`)
        if (event._tag === "Line" && options.verbose) return Console.log(event.line.text)
        return Effect.void
      }),
      Effect.forkScoped
    )
    if (file.settings.autoStart) yield* supervisor.start
    return yield* Effect.never
  })

const layerFor = (file: ArgusFile, options: StartOptions) =>
  Diagnostics.layer.pipe(
    Layer.provideMerge(Repository.layer),
    Layer.provideMerge(GitConnection.layer),
    Layer.provideMerge(Supervisor.layer),
    Layer.provide(SourceLocator.layer),
    Layer.provide(serverLayer(file, options)),
    Layer.provide(NodeServices.layer)
  )

export const startArgus = (options: StartOptions) =>
  Effect.gen(function*() {
    const existing = readArgusFile(options.home)
    const port = Number(process.env.ARGUS_PORT) || existing?.panelPort || DEFAULT_PANEL_PORT
    const host = yield* startHost(port).pipe(
      Effect.mapError((error) =>
        new Error(error.message.includes("EADDRINUSE") ? `Port ${port} is busy. Is Argus already running?` : error.message)
      )
    )
    const url = `http://localhost:${port}`

    yield* Console.log("")
    yield* Console.log(`  ${BOLD}Argus ${VERSION}${RESET}${options.simulate ? "  simulated FXServer" : ""}`)
    yield* Console.log(`  Panel   ${url}`)
    if (!panelAvailable()) yield* Console.log(`  ${DIM}The panel is not built. Run npm run setup in the Argus folder.${RESET}`)
    yield* Console.log(`  ${DIM}Keep this window open. Ctrl+C stops the server and Argus.${RESET}`)
    yield* Console.log("")

    let file = existing
    if (!file) {
      const installed = yield* Deferred.make<ArgusFile>()
      host.use(makeSetupHandler(options.home, (next) => Effect.runFork(Deferred.succeed(installed, next))))
      yield* Console.log(`  First run. Finish the setup in the browser: ${BOLD}${url}${RESET}`)
      if (options.open) openBrowser(url)
      file = yield* Deferred.await(installed)
      yield* Console.log(`  ${BOLD}${file.settings.name}${RESET} is set up.`)
    } else {
      yield* Console.log(`  Managing ${BOLD}${file.settings.name}${RESET}`)
      if (options.open) openBrowser(url)
    }

    const ready = file
    return yield* runServer(host, ready, options).pipe(Effect.provide(layerFor(ready, options)))
  }).pipe(Effect.scoped)
