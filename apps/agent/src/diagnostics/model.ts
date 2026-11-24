import { Schema } from "effect"

export const ProblemKind = Schema.Literals([
  "script-error",
  "resource-error",
  "thread-hang",
  "hitch",
  "crashed",
  "port-in-use",
  "boot-timeout",
  "heartbeat-lost",
  "spawn-failed",
  "crash-loop"
])
export type ProblemKind = typeof ProblemKind.Type

export const Severity = Schema.Literals(["low", "medium", "high", "critical"])
export type Severity = typeof Severity.Type

export const CodeLocation = Schema.Struct({
  resource: Schema.String,
  file: Schema.String,
  line: Schema.Int
})
export type CodeLocation = typeof CodeLocation.Type

export const Impact = Schema.Struct({
  severity: Severity,
  score: Schema.Number,
  summary: Schema.String,
  lastHour: Schema.Int,
  players: Schema.Int,
  disruptedPlayerSeconds: Schema.Number,
  worstMs: Schema.Number
})
export type Impact = typeof Impact.Type

export const Diagnosis = Schema.Struct({
  rule: Schema.String,
  cause: Schema.String,
  steps: Schema.Array(Schema.String),
  confidence: Schema.Literals(["likely", "confirmed"])
})
export type Diagnosis = typeof Diagnosis.Type

export const Problem = Schema.Struct({
  id: Schema.String,
  kind: ProblemKind,
  resource: Schema.optionalKey(Schema.String),
  location: Schema.optionalKey(CodeLocation),
  message: Schema.String,
  count: Schema.Int,
  firstSeen: Schema.Number,
  lastSeen: Schema.Number,
  impact: Impact,
  diagnosis: Schema.optionalKey(Diagnosis)
})
export type Problem = typeof Problem.Type
