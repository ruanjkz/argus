import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Option, Stream } from "effect"

import type { IncidentKind, ServerStatus, SupervisorEvent } from "../src/domain.ts"
import { Supervisor, type SupervisorShape } from "../src/supervisor.ts"
import { supervisorLayer } from "./support.ts"

const waitForStatus = (supervisor: SupervisorShape, status: ServerStatus) =>
  supervisor.statusChanges.pipe(
    Stream.filter((value) => value === status),
    Stream.runHead,
    Effect.timeout("15 seconds")
  )

const waitForEvents = (supervisor: SupervisorShape, predicate: (event: SupervisorEvent) => boolean, count = 1) =>
  supervisor.events.pipe(Stream.filter(predicate), Stream.take(count), Stream.runCollect, Effect.timeout("15 seconds"))

const isStatus = (status: ServerStatus) => (event: SupervisorEvent) =>
  event._tag === "StatusChanged" && event.status === status

const isIncident = (kind: IncidentKind) => (event: SupervisorEvent) =>
  event._tag === "Incident" && event.incident.kind === kind

const isLine = (text: string) => (event: SupervisorEvent) => event._tag === "Line" && event.line.text.includes(text)

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe("Supervisor", () => {
  it.live("goes online, forwards sanitized commands and stops gracefully", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      yield* supervisor.start
      yield* waitForStatus(supervisor, "online")
      yield* waitForEvents(supervisor, (event) => event._tag === "PlayersChanged" && event.players === 48)
      assert.strictEqual(yield* supervisor.players, 48)

      yield* supervisor.send("echo a;b")
      yield* waitForEvents(supervisor, isLine("a\u037eb"))

      yield* supervisor.stop
      assert.strictEqual(yield* supervisor.status, "offline")
      assert.isTrue(Option.isNone(yield* supervisor.pid))
      const history = yield* supervisor.history
      assert.isTrue(history.some((line) => line.text.includes("Quitting")))
      assert.isTrue(history.some((line) => line.source === "command" && line.text === "echo a\u037eb"))
    }).pipe(Effect.provide(supervisorLayer("normal"))))

  it.live("rejects commands while offline", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      const error = yield* Effect.flip(supervisor.send("status"))
      assert.strictEqual(error._tag, "NotRunning")
      assert.strictEqual(error.status, "offline")
    }).pipe(Effect.provide(supervisorLayer("normal"))))

  it.live("restarts with a new process", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      yield* supervisor.start
      yield* waitForStatus(supervisor, "online")
      const first = yield* supervisor.pid

      yield* supervisor.restart
      yield* waitForEvents(supervisor, isStatus("online"), 2)
      const second = yield* supervisor.pid

      assert.isTrue(Option.isSome(first) && Option.isSome(second))
      assert.notStrictEqual(Option.getOrThrow(first), Option.getOrThrow(second))
      assert.isFalse(isAlive(Option.getOrThrow(first)))
    }).pipe(Effect.provide(supervisorLayer("normal"))))

  it.live("brings the server back after a crash", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      yield* supervisor.start
      yield* waitForEvents(supervisor, isIncident("crashed"))
      yield* waitForEvents(supervisor, isStatus("restarting"))
      yield* waitForEvents(supervisor, isStatus("online"), 2)
    }).pipe(Effect.provide(supervisorLayer("crash"))))

  it.live("backs off while the port is in use", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      yield* supervisor.start
      const incidents = yield* waitForEvents(supervisor, isIncident("port-in-use"), 2)
      assert.strictEqual(incidents.length, 2)
      yield* supervisor.stop
      assert.strictEqual(yield* supervisor.status, "offline")
    }).pipe(Effect.provide(supervisorLayer("bind-error"))))

  it.live("detects a hung server and restarts it", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      yield* supervisor.start
      yield* waitForEvents(supervisor, isIncident("thread-hang"))
      yield* waitForEvents(supervisor, isIncident("heartbeat-lost"))
      yield* waitForEvents(supervisor, isStatus("online"), 2)
    }).pipe(Effect.provide(supervisorLayer("hang"))))

  it.live("gives up after repeated boot timeouts", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      yield* supervisor.start
      yield* waitForEvents(supervisor, isIncident("crash-loop"))
      yield* waitForStatus(supervisor, "offline")
      const history = yield* supervisor.history
      assert.strictEqual(history.filter((line) => line.text.startsWith("No heartbeat")).length, 3)
    }).pipe(Effect.provide(supervisorLayer("no-heartbeat", { bootTimeout: Duration.millis(600), maxConsecutiveFailures: 2 }))))

  it.live("kills a server that ignores quit", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      yield* supervisor.start
      yield* waitForStatus(supervisor, "online")
      const pid = Option.getOrThrow(yield* supervisor.pid)

      yield* supervisor.stop
      assert.strictEqual(yield* supervisor.status, "offline")
      const history = yield* supervisor.history
      assert.isTrue(history.some((line) => line.text.includes("did not exit in time")))
      assert.isFalse(isAlive(pid))
    }).pipe(Effect.provide(supervisorLayer("ignore-quit", { stopTimeout: Duration.millis(800) }))))

  it.live("stays offline when the executable does not exist", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      yield* supervisor.start
      yield* waitForEvents(supervisor, isIncident("spawn-failed"))
      yield* waitForStatus(supervisor, "offline")
    }).pipe(Effect.provide(supervisorLayer("normal", { executable: "C:/argus/missing/FXServer.exe" }))))
})
