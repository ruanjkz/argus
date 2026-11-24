import readline from "node:readline"
import { fileURLToPath } from "node:url"

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Config, Console, Duration, Effect, Layer, Option, Stream } from "effect"

import { ServerConfig } from "./config.ts"
import type { Problem } from "./diagnostics/model.ts"
import { Diagnostics } from "./diagnostics/service.ts"
import { SourceLocator } from "./diagnostics/source-locator.ts"
import { Repository } from "./git/repository.ts"
import type { SupervisorEvent } from "./domain.ts"
import { Supervisor } from "./supervisor.ts"

const DIM = "\u001b[2m"
const RESET = "\u001b[0m"

const fakeServer = fileURLToPath(new URL("../fixtures/fake-fxserver.mjs", import.meta.url))
const fakeResources = fileURLToPath(new URL("../fixtures/resources", import.meta.url))

const ConfigLayer = Layer.unwrap(
  Effect.gen(function*() {
    const executable = yield* Config.option(Config.String("ARGUS_FXSERVER"))
    const args = yield* Config.String("ARGUS_FXSERVER_ARGS").pipe(Config.withDefault(""))
    const cwd = yield* Config.option(Config.String("ARGUS_FXSERVER_CWD"))
    const resources = yield* Config.option(Config.String("ARGUS_RESOURCES"))

    if (Option.isNone(executable)) {
      yield* Console.log(`${DIM}[argus] ARGUS_FXSERVER is not set, running the simulated FXServer${RESET}`)
      return ServerConfig.layer({
        executable: process.execPath,
        args: [fakeServer],
        env: { FAKE_HEARTBEAT_MS: "1000" },
        resourcesPath: fakeResources,
        bootTimeout: Duration.seconds(15),
        heartbeatTimeout: Duration.seconds(10),
        stopTimeout: Duration.seconds(5)
      })
    }

    return ServerConfig.layer({
      executable: executable.value,
      args: args.split(" ").filter((arg) => arg.length > 0),
      cwd: Option.getOrUndefined(cwd),
      resourcesPath: Option.getOrUndefined(resources) ??
        Option.getOrUndefined(Option.map(cwd, (folder) => `${folder}/resources`))
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
    case "PlayersChanged":
      return Console.log(`${DIM}[argus] ${event.players} players online${RESET}`)
  }
}

const describeProblem = (problem: Problem) => {
  const bundle = problem.location ? `${problem.location.file}:${problem.location.line}` : undefined
  const where = problem.location
    ? problem.source
      ? `${problem.location.resource}/${problem.source.file}:${problem.source.line} (${bundle})`
      : `${problem.location.resource}/${bundle}`
    : problem.resource ?? problem.kind
  const lines = [
    `${DIM}[argus]${RESET} ${problem.impact.severity.toUpperCase()}  ${where}  ${problem.message}`,
    `${DIM}        impact  ${problem.impact.summary}${RESET}`
  ]
  if (problem.introducedBy) {
    const blame = problem.introducedBy
    lines.push(
      blame.uncommitted
        ? `${DIM}        since   this line was edited on the server and is not committed${RESET}`
        : `${DIM}        since   ${blame.commit} by ${blame.author}: ${blame.summary}${RESET}`
    )
  }
  if (problem.diagnosis) {
    lines.push(`${DIM}        cause   ${problem.diagnosis.cause} (${problem.diagnosis.confidence})${RESET}`)
    for (const step of problem.diagnosis.steps) lines.push(`${DIM}        fix     ${step}${RESET}`)
  }
  return lines.join("\n")
}

const inputLines = Stream.fromAsyncIterable(
  readline.createInterface({ input: process.stdin, terminal: false }),
  (cause) => cause
)

const program = Effect.gen(function*() {
  const supervisor = yield* Supervisor
  const diagnostics = yield* Diagnostics
  const repository = yield* Repository
  yield* supervisor.events.pipe(Stream.runForEach(render), Effect.forkScoped)
  const announced = new Set<string>()
  yield* diagnostics.changes.pipe(
    Stream.filter((problem) => !announced.has(problem.id)),
    Stream.runForEach((problem) => {
      announced.add(problem.id)
      return Console.log(`${DIM}[argus] new problem, type :problems for details: ${problem.message}${RESET}`)
    }),
    Effect.forkScoped
  )
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
      case ":drift":
        return repository.drift.pipe(
          Effect.flatMap((entries) =>
            Console.log(
              entries.length === 0
                ? `${DIM}[argus] resources match the last commit${RESET}`
                : entries.map((entry) => `${DIM}[argus] ${entry.state.padEnd(9)} ${entry.path}${RESET}`).join("\n")
            )
          )
        )
      case ":problems":
        return diagnostics.problems.pipe(
          Effect.flatMap((problems) =>
            Console.log(
              problems.length === 0 ? `${DIM}[argus] no problems recorded${RESET}` : problems.map(describeProblem).join("\n")
            )
          )
        )
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

const MainLayer = Diagnostics.layer.pipe(
  Layer.provideMerge(Supervisor.layer),
  Layer.provideMerge(Repository.layer),
  Layer.provide(SourceLocator.layer),
  Layer.provide(ConfigLayer),
  Layer.provide(NodeServices.layer)
)

NodeRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(MainLayer)))
