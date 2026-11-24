import { Clock, Context, Effect, Layer, Option, PubSub, Stream } from "effect"

import type { Incident, SupervisorEvent } from "../domain.ts"
import { Supervisor } from "../supervisor.ts"
import { computeImpact, type Occurrence } from "./impact.ts"
import type { CodeLocation, Diagnosis, Problem, ProblemKind, Runtime, SourceLocation } from "./model.ts"
import { diagnose } from "./rules.ts"
import { normalizeMessage, parseLocation, parseSignal, runtimeOf, type ScriptErrorSignal } from "./signals.ts"
import { SourceLocator } from "./source-locator.ts"

const MAX_OCCURRENCES = 500
const HANG_MATCH_WINDOW_MS = 30_000
const HANG_MINIMUM_MS = 1000
const STACK_WAIT = "300 millis"

interface Group {
  readonly id: string
  readonly kind: ProblemKind
  readonly resource: string | undefined
  readonly location: CodeLocation | undefined
  readonly source: SourceLocation | undefined
  readonly runtime: Runtime | undefined
  readonly diagnosis: Diagnosis | undefined
  readonly firstSeen: number
  readonly occurrences: Array<Occurrence>
  message: string
  count: number
  lastSeen: number
}

interface Observation {
  readonly kind: ProblemKind
  readonly resource: string | undefined
  readonly location: CodeLocation | undefined
  readonly message: string
  readonly time: number
  readonly source?: SourceLocation | undefined
  readonly runtime?: Runtime | undefined
  readonly origin?: string | undefined
  readonly durationMs?: number
  readonly ongoing?: boolean
}

interface PendingError {
  readonly signal: ScriptErrorSignal
  readonly time: number
}

const groupId = (kind: ProblemKind, resource: string | undefined, location: CodeLocation | undefined, message: string) =>
  [kind, resource ?? "", location ? `${location.file}:${location.line}` : "", normalizeMessage(message)].join("|")

const toProblem = (group: Group, now: number): Problem => ({
  id: group.id,
  kind: group.kind,
  message: group.message,
  count: group.count,
  firstSeen: group.firstSeen,
  lastSeen: group.lastSeen,
  impact: computeImpact(group.kind, group.count, group.occurrences, now),
  ...(group.resource === undefined ? {} : { resource: group.resource }),
  ...(group.location === undefined ? {} : { location: group.location }),
  ...(group.source === undefined ? {} : { source: group.source }),
  ...(group.runtime === undefined ? {} : { runtime: group.runtime }),
  ...(group.diagnosis === undefined ? {} : { diagnosis: group.diagnosis })
})

const make = Effect.gen(function*() {
  const supervisor = yield* Supervisor
  const locator = yield* SourceLocator
  const pubsub = yield* PubSub.unbounded<Problem>()
  const groups = new Map<string, Group>()
  let players = 0
  let outage: Occurrence | undefined
  let pendingHang: { readonly group: Group; readonly occurrence: Occurrence } | undefined
  let pendingError: PendingError | undefined

  const observe = (observation: Observation): { readonly group: Group; readonly occurrence: Occurrence } => {
    const { kind, resource, location, message, time } = observation
    const id = groupId(kind, resource, location, message)
    let group = groups.get(id)
    if (!group) {
      group = {
        id,
        kind,
        resource,
        location,
        source: observation.source,
        runtime: observation.runtime,
        diagnosis: diagnose({ kind, resource, location, message, source: observation.source, origin: observation.origin }),
        firstSeen: time,
        occurrences: [],
        message,
        count: 0,
        lastSeen: time
      }
      groups.set(id, group)
    }
    const occurrence: Occurrence = {
      time,
      players,
      durationMs: observation.durationMs ?? 0,
      ongoingSince: observation.ongoing ? time : undefined
    }
    group.occurrences.push(occurrence)
    if (group.occurrences.length > MAX_OCCURRENCES) group.occurrences.splice(0, group.occurrences.length - MAX_OCCURRENCES)
    group.message = message
    group.count += 1
    group.lastSeen = time
    return { group, occurrence }
  }

  const publish = (group: Group, now: number) => PubSub.publish(pubsub, toProblem(group, now)).pipe(Effect.asVoid)

  const closeOutage = (time: number) => {
    if (!outage || outage.ongoingSince === undefined) return
    outage.durationMs = Math.max(0, time - outage.ongoingSince)
    outage.ongoingSince = undefined
    outage = undefined
  }

  const recordScriptError = Effect.fnUntraced(function*(signal: ScriptErrorSignal, time: number) {
    const known = groups.has(groupId("script-error", signal.resource, signal.location, signal.message))
    const source = known || !signal.location ? Option.none<SourceLocation>() : yield* locator.resolve(signal.location)
    const { group } = observe({
      kind: "script-error",
      resource: signal.resource,
      location: signal.location,
      message: signal.message,
      time,
      source: Option.getOrUndefined(source),
      runtime: signal.runtime,
      origin: signal.origin
    })
    yield* publish(group, time)
  })

  const flushPendingError = Effect.suspend(() => {
    const held = pendingError
    if (!held) return Effect.void
    pendingError = undefined
    return recordScriptError(held.signal, held.time)
  })

  const holdForStack = Effect.fnUntraced(function*(signal: ScriptErrorSignal, time: number) {
    const held: PendingError = { signal, time }
    pendingError = held
    yield* Effect.forkChild(
      Effect.sleep(STACK_WAIT).pipe(
        Effect.andThen(Effect.suspend(() => pendingError === held ? flushPendingError : Effect.void))
      )
    )
  })

  const onLine = Effect.fnUntraced(function*(text: string, time: number) {
    const signal = parseSignal(text)

    if (signal?.kind === "stack-frame") {
      const held = pendingError
      if (!held || !signal.location) return
      if (held.signal.resource !== undefined && signal.resource !== undefined && held.signal.resource !== signal.resource) return
      pendingError = undefined
      yield* recordScriptError({
        ...held.signal,
        resource: held.signal.resource ?? signal.location.resource,
        location: signal.location,
        runtime: held.signal.runtime ?? runtimeOf(signal.location.file)
      }, held.time)
      return
    }

    yield* flushPendingError
    if (!signal) return

    if (signal.kind === "script-error") {
      if (signal.location) yield* recordScriptError(signal, time)
      else yield* holdForStack(signal, time)
      return
    }

    if (signal.kind === "hitch") {
      const hang = pendingHang
      const completesHang = hang !== undefined &&
        signal.thread === "server" &&
        signal.milliseconds >= HANG_MINIMUM_MS &&
        time - hang.occurrence.time <= HANG_MATCH_WINDOW_MS
      if (completesHang) {
        hang.occurrence.durationMs = signal.milliseconds
        pendingHang = undefined
        yield* publish(hang.group, time)
        return
      }
      const { group } = observe({
        kind: "hitch",
        resource: undefined,
        location: undefined,
        message: `${signal.thread} thread stalled`,
        time,
        durationMs: signal.milliseconds
      })
      yield* publish(group, time)
      return
    }

    const { group } = observe({
      kind: "resource-error",
      resource: signal.resource,
      location: undefined,
      message: signal.message,
      time
    })
    yield* publish(group, time)
  })

  const onIncident = Effect.fnUntraced(function*(incident: Incident) {
    if (incident.kind === "thread-hang") {
      const location = incident.detail === undefined ? undefined : parseLocation(incident.detail)
      const observed = observe({
        kind: "thread-hang",
        resource: location?.resource,
        location,
        message: incident.message,
        time: incident.time,
        runtime: runtimeOf(location?.file)
      })
      pendingHang = observed
      yield* publish(observed.group, incident.time)
      return
    }

    const startsOutage = outage === undefined && incident.kind !== "spawn-failed" && incident.kind !== "crash-loop"
    const observed = observe({
      kind: incident.kind,
      resource: undefined,
      location: undefined,
      message: incident.message,
      time: incident.time,
      ongoing: startsOutage
    })
    if (startsOutage) outage = observed.occurrence
    yield* publish(observed.group, incident.time)
  })

  const onEvent = (event: SupervisorEvent) => {
    switch (event._tag) {
      case "PlayersChanged":
        return Effect.sync(() => {
          players = event.players
        })
      case "StatusChanged":
        return Effect.sync(() => {
          if (event.status === "online" || event.status === "stopping") closeOutage(event.time)
        })
      case "Line":
        return event.line.source === "stdout" || event.line.source === "stderr"
          ? onLine(event.line.text, event.line.time)
          : Effect.void
      case "Incident":
        return onIncident(event.incident)
    }
  }

  yield* supervisor.events.pipe(Stream.runForEach(onEvent), Effect.forkScoped)

  const problems = Effect.gen(function*() {
    const now = yield* Clock.currentTimeMillis
    return Array.from(groups.values(), (group) => toProblem(group, now)).sort(
      (first, second) => second.impact.score - first.impact.score || second.lastSeen - first.lastSeen
    )
  })

  return Diagnostics.of({ problems, changes: Stream.fromPubSub(pubsub) })
})

export class Diagnostics extends Context.Service<Diagnostics, {
  readonly problems: Effect.Effect<ReadonlyArray<Problem>>
  readonly changes: Stream.Stream<Problem>
}>()("argus/agent/Diagnostics") {
  static readonly layer = Layer.effect(Diagnostics, make)
}
