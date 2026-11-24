import { Schema } from "effect"

export const ServerStatus = Schema.Literals(["offline", "starting", "online", "stopping", "restarting"])
export type ServerStatus = typeof ServerStatus.Type

export const LineSource = Schema.Literals(["stdout", "stderr", "command", "system"])
export type LineSource = typeof LineSource.Type

export const ConsoleLine = Schema.Struct({
  id: Schema.Int,
  time: Schema.Number,
  source: LineSource,
  text: Schema.String
})
export type ConsoleLine = typeof ConsoleLine.Type

export const IncidentKind = Schema.Literals([
  "crashed",
  "port-in-use",
  "boot-timeout",
  "heartbeat-lost",
  "thread-hang",
  "spawn-failed",
  "crash-loop"
])
export type IncidentKind = typeof IncidentKind.Type

export const Incident = Schema.Struct({
  kind: IncidentKind,
  time: Schema.Number,
  message: Schema.String,
  detail: Schema.optionalKey(Schema.String)
})
export type Incident = typeof Incident.Type

export const SupervisorEvent = Schema.Union([
  Schema.Struct({
    _tag: Schema.tag("StatusChanged"),
    status: ServerStatus,
    time: Schema.Number,
    pid: Schema.optionalKey(Schema.Int)
  }),
  Schema.Struct({ _tag: Schema.tag("Line"), line: ConsoleLine }),
  Schema.Struct({ _tag: Schema.tag("Incident"), incident: Incident }),
  Schema.Struct({ _tag: Schema.tag("PlayersChanged"), players: Schema.Int, time: Schema.Number })
])
export type SupervisorEvent = typeof SupervisorEvent.Type
