import { Schema } from "effect"

const MAX_PENDING_LENGTH = 1_048_576

export const BindErrorTrace = Schema.Struct({
  type: Schema.Literal("bind_error"),
  address: Schema.String
})

export const WatchdogBarkTrace = Schema.Struct({
  type: Schema.Literal("watchdog_bark"),
  thread: Schema.optionalKey(Schema.Union([Schema.String, Schema.Number])),
  stack: Schema.optionalKey(Schema.String)
})

export const NucleusConnectedTrace = Schema.Struct({
  type: Schema.Literal("nucleus_connected"),
  url: Schema.String
})

export const ScriptTrace = Schema.Struct({
  type: Schema.Literal("script_structured_trace"),
  resource: Schema.String,
  payload: Schema.Unknown
})

export const Trace = Schema.Struct({
  channel: Schema.String,
  data: Schema.Union([BindErrorTrace, WatchdogBarkTrace, NucleusConnectedTrace, ScriptTrace])
})
export type Trace = typeof Trace.Type

export const decodeTrace = Schema.decodeUnknownOption(Schema.fromJsonString(Trace))

export const HeartbeatPayload = Schema.Struct({
  type: Schema.Literal("heartbeat")
})

export const isHeartbeatPayload = Schema.is(HeartbeatPayload)

export const splitJsonValues = (pending: string, chunk: string): readonly [string, ReadonlyArray<string>] => {
  const text = pending + chunk
  const values: Array<string> = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === "\"") inString = false
      continue
    }
    if (char === "\"") {
      if (depth > 0) inString = true
      continue
    }
    if (char === "{" || char === "[") {
      if (depth === 0) start = index
      depth++
      continue
    }
    if ((char === "}" || char === "]") && depth > 0) {
      depth--
      if (depth === 0) {
        values.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }

  const rest = depth > 0 ? text.slice(start) : ""
  return [rest.length > MAX_PENDING_LENGTH ? "" : rest, values]
}
