import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { NodeServices } from "@effect/platform-node"
import { Console, Duration, Effect, Layer, Schedule, Stream } from "effect"

import { ServerConfig } from "./config.ts"
import { Diagnostics } from "./diagnostics/service.ts"
import { SourceLocator } from "./diagnostics/source-locator.ts"
import { GitConnection } from "./git/connection.ts"
import { Repository } from "./git/repository.ts"
import { readArgusFile, toServerSettings, type ArgusFile } from "./home.ts"
import { AgentApi } from "./http/api.ts"
import { Supervisor } from "./supervisor.ts"

export const VERSION = "0.1.0"

const PANEL_FOLDER = fileURLToPath(new URL("../../panel", import.meta.url))
const FAKE_SERVER = fileURLToPath(new URL("../fixtures/fake-fxserver.mjs", import.meta.url))
const FAKE_RESOURCES = fileURLToPath(new URL("../fixtures/resources", import.meta.url))
const SCHEDULE_TICK = Duration.seconds(20)

const DIM = "\u001b[2m"
const BOLD = "\u001b[1m"
const RESET = "\u001b[0m"

export interface StartOptions {
  readonly home: string
  readonly simulate: boolean
  readonly panel: boolean
  readonly verbose: boolean
}

const serverLayer = (file: ArgusFile, options: StartOptions) => {
  if (!options.simulate) return ServerConfig.layer(toServerSettings(file.settings, options.home))
  const resources = join(file.settings.dataFolder, "resources")
  return ServerConfig.layer({
    ...toServerSettings(file.settings, options.home),
    executable: process.execPath,
    args: [FAKE_SERVER],
    cwd: undefined,
    env: { FAKE_HEARTBEAT_MS: "1000" },
    resourcesPath: existsSync(resources) ? resources : FAKE_RESOURCES
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

const panelProcess = (file: ArgusFile, options: StartOptions) =>
  Effect.acquireRelease(
    Effect.sync((): ChildProcess | undefined => {
      if (!existsSync(join(PANEL_FOLDER, ".next", "BUILD_ID"))) return undefined
      const next = join(PANEL_FOLDER, "node_modules", "next", "dist", "bin", "next")
      return spawn(process.execPath, [next, "start", "-p", String(file.panelPort), "-H", "127.0.0.1"], {
        cwd: PANEL_FOLDER,
        env: { ...process.env, ARGUS_HOME: options.home, NODE_ENV: "production" },
        stdio: options.verbose ? "inherit" : "ignore",
        windowsHide: true
      })
    }),
    (child) => Effect.sync(() => void child?.kill())
  )

const program = (file: ArgusFile, options: StartOptions) =>
  Effect.gen(function*() {
    const supervisor = yield* Supervisor
    yield* Diagnostics
    const api = yield* AgentApi
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

    const panel = options.panel ? yield* panelProcess(file, options) : undefined
    yield* Console.log("")
    yield* Console.log(`  ${BOLD}Argus ${VERSION}${RESET}  ${file.settings.name}${options.simulate ? "  simulated FXServer" : ""}`)
    if (panel) yield* Console.log(`  Panel   http://localhost:${file.panelPort}`)
    else if (options.panel) yield* Console.log(`  Panel   not built. Run ${BOLD}npm run setup${RESET} in the Argus folder, then start again.`)
    yield* Console.log(`  Agent   http://127.0.0.1:${api.port}`)
    yield* Console.log(`  ${DIM}Ctrl+C stops the server and Argus.${RESET}`)
    yield* Console.log("")

    if (file.settings.autoStart) yield* supervisor.start
    return yield* Effect.never
  })

export const startArgus = (options: StartOptions) =>
  Effect.gen(function*() {
    const file = readArgusFile(options.home)
    if (!file) return yield* Effect.fail(new Error("Argus is not set up yet. Run argus init first."))
    const layer = AgentApi.layer({ port: file.agentPort, token: file.token, home: options.home, version: VERSION }).pipe(
      Layer.provideMerge(Diagnostics.layer),
      Layer.provideMerge(Supervisor.layer),
      Layer.provideMerge(Repository.layer),
      Layer.provideMerge(GitConnection.layer),
      Layer.provide(SourceLocator.layer),
      Layer.provide(serverLayer(file, options)),
      Layer.provide(NodeServices.layer)
    )
    return yield* program(file, options).pipe(Effect.scoped, Effect.provide(layer))
  })
