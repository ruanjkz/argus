import readline from "node:readline"
import { fileURLToPath } from "node:url"

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Config, Console, Duration, Effect, Layer, Option, Stream } from "effect"

import { ServerConfig } from "./config.ts"
import type { SupervisorEvent } from "./domain.ts"
import { Supervisor } from "./supervisor.ts"

const DIM = "\u001b[2m"
const RESET = "\u001b[0m"

const fakeServer = fileURLToPath(new URL("../fixtures/fake-fxserver.mjs", import.meta.url))

const ConfigLayer = Layer.unwrap(
  Effect.gen(function*() {
    const executable = yield* Config.option(Config.String("ARGUS_FXSERVER"))
    const args = yield* Config.String("ARGUS_FXSERVER_ARGS").pipe(Config.withDefault(""))
    const cwd = yield* Config.option(Config.String("ARGUS_FXSERVER_CWD"))

    if (Option.isNone(executable)) {
      yield* Console.log(`${DIM}[argus] ARGUS_FXSERVER is not set, running the simulated FXServer${RESET}`)
      return ServerConfig.layer({
        executable: process.execPath,
        args: [fakeServer],
        env: { FAKE_HEARTBEAT_MS: "1000" },
        bootTimeout: Duration.seconds(15),
        heartbeatTimeout: Duration.seconds(10),
        stopTimeout: Duration.seconds(5)
      })
    }

    return ServerConfig.layer({
      executable: executable.value,
      args: args.split(" ").filter((arg) => arg.length > 0),
      cwd: Option.getOrUndefined(cwd)
    })
  })
)

const render = (event: SupervisorEvent) => {
  switch (event._tag) {
    case "Line": {
      const { source, text } = event.line
      if (source === "system") return Console.log(`${DIM}[argus] ${text}${RESET}`)
      if (source === "command") return Console.log(`${DIM}>${RESET} ${text}`)
      return Console.log(text)
    }
    case "StatusChanged":
      return Console.log(`${DIM}[argus] status ${event.status}${event.pid === undefined ? "" : ` pid ${event.pid}`}${RESET}`)
    case "Incident":
      return Effect.void
  }
}

const inputLines = Stream.fromAsyncIterable(
  readline.createInterface({ input: process.stdin, terminal: false }),
  (cause) => cause
)

const program = Effect.gen(function*() {
  const supervisor = yield* Supervisor
  yield* supervisor.events.pipe(Stream.runForEach(render), Effect.forkScoped)
  yield* supervisor.start

  const handle = (line: string) => {
    const input = line.trim()
    switch (input) {
      case "":
        return Effect.void
      case ":start":
        return supervisor.start
      case ":stop":
        return supervisor.stop
      case ":restart":
        return supervisor.restart
      case ":status":
        return supervisor.status.pipe(Effect.flatMap((status) => Console.log(`${DIM}[argus] status ${status}${RESET}`)))
      default:
        return supervisor.send(input).pipe(
          Effect.catchTag("NotRunning", (error) => Console.log(`${DIM}[argus] server is ${error.status}${RESET}`))
        )
    }
  }

  yield* inputLines.pipe(
    Stream.takeWhile((line) => line.trim() !== ":exit"),
    Stream.runForEach(handle),
    Effect.ignore,
    Effect.ensuring(supervisor.stop)
  )
})

const MainLayer = Supervisor.layer.pipe(Layer.provide(ConfigLayer), Layer.provide(NodeServices.layer))

NodeRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(MainLayer)))
