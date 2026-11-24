import {
  Clock,
  Context,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Layer,
  Option,
  PubSub,
  Ref,
  Schedule,
  Scope,
  Semaphore,
  Stream,
  SubscriptionRef
} from "effect"
import { ChildProcessSpawner } from "effect/process"

import { isQuitCommand, sanitizeCommand } from "./commands.ts"
import { ServerConfig } from "./config.ts"
import type { ConsoleLine, IncidentKind, LineSource, ServerStatus, SupervisorEvent } from "./domain.ts"
import { BootTimeout, Crashed, HeartbeatLost, NotRunning, PortInUse, SpawnFailed, type SessionFailure } from "./errors.ts"
import { decodeHeartbeat, type Trace } from "./fd3.ts"
import { type FxProcess, spawnFxServer } from "./fx-process.ts"
import { describeFailure, isRetryable, restartDelay } from "./policy.ts"

type Intent = "run" | "stop" | "restart"

export interface SupervisorShape {
  readonly status: Effect.Effect<ServerStatus>
  readonly statusChanges: Stream.Stream<ServerStatus>
  readonly events: Stream.Stream<SupervisorEvent>
  readonly history: Effect.Effect<ReadonlyArray<ConsoleLine>>
  readonly pid: Effect.Effect<Option.Option<number>>
  readonly players: Effect.Effect<number>
  readonly start: Effect.Effect<void>
  readonly stop: Effect.Effect<void>
  readonly restart: Effect.Effect<void>
  send(command: string): Effect.Effect<void, NotRunning>
}

const make = Effect.gen(function*() {
  const settings = yield* ServerConfig
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const statusRef = yield* SubscriptionRef.make<ServerStatus>("offline")
  const intent = yield* SubscriptionRef.make<Intent>("stop")
  const pubsub = yield* PubSub.unbounded<SupervisorEvent>({ replay: settings.historySize })
  const lineCounter = yield* Ref.make(0)
  const playersRef = yield* Ref.make(0)
  const current = yield* Ref.make(Option.none<FxProcess>())
  const loopFiber = yield* Ref.make(Option.none<Fiber.Fiber<void>>())
  const lock = yield* Semaphore.make(1)
  const locked = Semaphore.withPermits(lock, 1)
  const runScope = yield* Effect.acquireRelease(Scope.make(), (scope, exit) => Scope.close(scope, exit))
  const lines: Array<ConsoleLine> = []

  const publish = (event: SupervisorEvent) => PubSub.publish(pubsub, event).pipe(Effect.asVoid)

  const emitLine = Effect.fnUntraced(function*(source: LineSource, text: string) {
    const id = yield* Ref.updateAndGet(lineCounter, (count) => count + 1)
    const time = yield* Clock.currentTimeMillis
    const line: ConsoleLine = { id, time, source, text }
    lines.push(line)
    if (lines.length > settings.historySize) lines.splice(0, lines.length - settings.historySize)
    yield* publish({ _tag: "Line", line })
  })

  const emitIncident = Effect.fnUntraced(function*(kind: IncidentKind, message: string, detail?: string) {
    const time = yield* Clock.currentTimeMillis
    yield* publish({
      _tag: "Incident",
      incident: detail === undefined ? { kind, time, message } : { kind, time, message, detail }
    })
    yield* emitLine("system", message)
  })

  const setStatus = Effect.fnUntraced(function*(status: ServerStatus) {
    const previous = yield* SubscriptionRef.getAndSet(statusRef, status)
    if (previous === status) return
    const running = yield* Ref.get(current)
    const time = yield* Clock.currentTimeMillis
    yield* publish(
      Option.isSome(running)
        ? { _tag: "StatusChanged", status, time, pid: running.value.pid }
        : { _tag: "StatusChanged", status, time }
    )
  })

  const setPlayers = Effect.fnUntraced(function*(count: number) {
    const players = Math.max(0, Math.round(count))
    const previous = yield* Ref.getAndSet(playersRef, players)
    if (previous === players) return
    const time = yield* Clock.currentTimeMillis
    yield* publish({ _tag: "PlayersChanged", players, time })
  })

  const shutdownRequested = SubscriptionRef.changes(intent).pipe(
    Stream.filter((value) => value !== "run"),
    Stream.runHead,
    Effect.asVoid
  )

  const runSession = Effect.fnUntraced(function*() {
    const process = yield* spawnFxServer(settings).pipe(
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.mapError((error) => new SpawnFailed({ message: error.message }))
    )
    yield* Ref.set(current, Option.some(process))
    yield* Effect.addFinalizer(() => Ref.set(current, Option.none()))

    if ((yield* SubscriptionRef.get(statusRef)) !== "restarting") yield* setStatus("starting")
    yield* setPlayers(0)
    yield* emitLine("system", `FXServer started with pid ${process.pid}`)

    const startedAt = yield* Clock.currentTimeMillis
    const lastHeartbeat = yield* Ref.make(Option.none<number>())
    const portError = yield* Deferred.make<never, PortInUse>()

    const onTrace = Effect.fnUntraced(function*(trace: Trace) {
      const data = trace.data
      switch (data.type) {
        case "bind_error":
          yield* Deferred.fail(portError, new PortInUse({ address: data.address }))
          return
        case "watchdog_bark":
          yield* emitIncident("thread-hang", `Server thread ${data.thread ?? "unknown"} is hung`, data.stack)
          return
        case "nucleus_connected":
          yield* emitLine("system", `Connected to Cfx.re at ${data.url}`)
          return
        case "script_structured_trace": {
          if (data.resource !== settings.heartbeatResource) return
          const heartbeat = decodeHeartbeat(data.payload)
          if (Option.isNone(heartbeat)) return
          const now = yield* Clock.currentTimeMillis
          const previous = yield* Ref.getAndSet(lastHeartbeat, Option.some(now))
          if (Option.isNone(previous) && (yield* SubscriptionRef.get(intent)) === "run") {
            yield* setStatus("online")
            yield* emitLine("system", "Server is online")
          }
          if (heartbeat.value.players !== undefined) yield* setPlayers(heartbeat.value.players)
          return
        }
      }
    })

    yield* process.output.pipe(
      Stream.runForEach((line) => emitLine(line.source, line.text)),
      Effect.ignore,
      Effect.forkScoped
    )
    yield* process.traces.pipe(Stream.runForEach(onTrace), Effect.ignore, Effect.forkScoped)

    const exited = process.exitCode.pipe(
      Effect.orElseSucceed(() => -1),
      Effect.flatMap((exitCode) =>
        SubscriptionRef.get(intent).pipe(
          Effect.flatMap((value) => value === "run" ? Effect.fail(new Crashed({ exitCode })) : Effect.void)
        )
      )
    )

    const watchdog = Effect.gen(function*() {
      if ((yield* SubscriptionRef.get(intent)) !== "run") return
      const now = yield* Clock.currentTimeMillis
      const last = yield* Ref.get(lastHeartbeat)
      if (Option.isNone(last)) {
        if (now - startedAt > Duration.toMillis(settings.bootTimeout)) {
          return yield* new BootTimeout({ waitedMs: now - startedAt })
        }
        return
      }
      if (now - last.value > Duration.toMillis(settings.heartbeatTimeout)) {
        return yield* new HeartbeatLost({ silentForMs: now - last.value })
      }
    }).pipe(Effect.repeat(Schedule.spaced(settings.watchdogInterval)), Effect.asVoid)

    const shutdown = shutdownRequested.pipe(
      Effect.andThen(emitLine("system", "Stopping FXServer")),
      Effect.andThen(process.send("quit")),
      Effect.andThen(process.exitCode.pipe(Effect.timeoutOption(settings.stopTimeout), Effect.orElseSucceed(() => Option.none()))),
      Effect.flatMap((exit) =>
        Option.isNone(exit) ? emitLine("system", "FXServer did not exit in time, killing it") : Effect.void
      )
    )

    yield* Effect.raceFirst(
      exited,
      Effect.raceFirst(Deferred.await(portError), Effect.raceFirst(watchdog, shutdown))
    )
  })

  const loop = Effect.gen(function*() {
    let attempt = 0
    while (true) {
      const startedAt = yield* Clock.currentTimeMillis
      const failure = yield* runSession().pipe(
        Effect.scoped,
        Effect.as(Option.none<SessionFailure>()),
        Effect.catch((error) => Effect.succeed(Option.some(error)))
      )
      const afterSession = yield* SubscriptionRef.get(intent)
      if (afterSession === "stop") return
      if (afterSession === "restart") {
        yield* SubscriptionRef.set(intent, "run")
        attempt = 0
        continue
      }
      if (Option.isNone(failure)) return

      const endedAt = yield* Clock.currentTimeMillis
      attempt = endedAt - startedAt >= Duration.toMillis(settings.stableAfter) ? 1 : attempt + 1
      const { kind, message } = describeFailure(failure.value)
      yield* emitIncident(kind, message)

      if (!isRetryable(failure.value)) return
      if (attempt > settings.maxConsecutiveFailures) {
        yield* emitIncident("crash-loop", `Gave up after ${settings.maxConsecutiveFailures} failed starts in a row`)
        return
      }

      const delay = restartDelay(failure.value, attempt, settings)
      yield* setStatus("restarting")
      yield* emitLine("system", `Restarting in ${Duration.format(delay)}`)
      yield* Effect.raceFirst(Effect.sleep(delay), shutdownRequested)

      const afterDelay = yield* SubscriptionRef.get(intent)
      if (afterDelay === "stop") return
      if (afterDelay === "restart") yield* SubscriptionRef.set(intent, "run")
    }
  })

  const runLoop = loop.pipe(
    Effect.ensuring(
      Effect.gen(function*() {
        yield* Ref.set(loopFiber, Option.none())
        yield* SubscriptionRef.set(intent, "stop")
        yield* setStatus("offline")
      })
    )
  )

  const startUnlocked = Effect.gen(function*() {
    if (Option.isSome(yield* Ref.get(loopFiber))) return
    yield* SubscriptionRef.set(intent, "run")
    yield* setStatus("starting")
    const gate = yield* Deferred.make<void>()
    const fiber = yield* Effect.forkIn(Deferred.await(gate).pipe(Effect.andThen(runLoop)), runScope)
    yield* Ref.set(loopFiber, Option.some(fiber))
    yield* Deferred.succeed(gate, undefined)
  })

  const start = locked(startUnlocked)

  const stop = locked(
    Effect.gen(function*() {
      const fiber = yield* Ref.get(loopFiber)
      if (Option.isNone(fiber)) return
      yield* SubscriptionRef.set(intent, "stop")
      yield* setStatus("stopping")
      yield* Fiber.await(fiber.value)
    })
  )

  const restart = locked(
    Effect.gen(function*() {
      if (Option.isNone(yield* Ref.get(loopFiber))) return yield* startUnlocked
      yield* SubscriptionRef.set(intent, "restart")
      yield* setStatus("restarting")
    })
  )

  const send = Effect.fn("Supervisor.send")(function*(input: string) {
    const status = yield* SubscriptionRef.get(statusRef)
    const process = yield* Ref.get(current)
    if (Option.isNone(process) || (status !== "online" && status !== "starting")) {
      return yield* new NotRunning({ status })
    }
    const command = sanitizeCommand(input)
    if (command.length === 0) return
    yield* emitLine("command", command)
    if (isQuitCommand(command)) {
      yield* Effect.forkIn(stop, runScope)
      return
    }
    yield* process.value.send(command)
  })

  yield* Effect.addFinalizer(() =>
    stop.pipe(Effect.timeout(Duration.sum(settings.stopTimeout, Duration.seconds(5))), Effect.ignore)
  )

  return Supervisor.of({
    status: SubscriptionRef.get(statusRef),
    statusChanges: SubscriptionRef.changes(statusRef),
    events: Stream.fromPubSub(pubsub),
    history: Effect.sync(() => [...lines]),
    pid: Ref.get(current).pipe(Effect.map(Option.map((process) => process.pid))),
    players: Effect.zipWith(SubscriptionRef.get(statusRef), Ref.get(playersRef), (status, players) =>
      status === "online" ? players : 0
    ),
    start,
    stop,
    restart,
    send
  })
})

export class Supervisor extends Context.Service<Supervisor, SupervisorShape>()("argus/agent/Supervisor") {
  static readonly layer = Layer.effect(Supervisor, make)
}
