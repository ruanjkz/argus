import { Schema } from "effect"

import { ServerStatus } from "./domain.ts"

export class SpawnFailed extends Schema.TaggedError<SpawnFailed>()("SpawnFailed", {
  message: Schema.String
}) {}

export class Crashed extends Schema.TaggedError<Crashed>()("Crashed", {
  exitCode: Schema.Number
}) {}

export class PortInUse extends Schema.TaggedError<PortInUse>()("PortInUse", {
  address: Schema.String
}) {}

export class BootTimeout extends Schema.TaggedError<BootTimeout>()("BootTimeout", {
  waitedMs: Schema.Number
}) {}

export class HeartbeatLost extends Schema.TaggedError<HeartbeatLost>()("HeartbeatLost", {
  silentForMs: Schema.Number
}) {}

export type SessionFailure = SpawnFailed | Crashed | PortInUse | BootTimeout | HeartbeatLost

export class NotRunning extends Schema.TaggedError<NotRunning>()("NotRunning", {
  status: ServerStatus
}) {}
