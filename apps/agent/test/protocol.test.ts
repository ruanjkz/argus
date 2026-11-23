import { assert, describe, it } from "@effect/vitest"
import { Duration, Option } from "effect"

import { isQuitCommand, sanitizeCommand } from "../src/commands.ts"
import { defaultSettings } from "../src/config.ts"
import { BootTimeout, Crashed, PortInUse, SpawnFailed } from "../src/errors.ts"
import { decodeTrace, isHeartbeatPayload, splitJsonValues } from "../src/fd3.ts"
import { isRetryable, restartDelay } from "../src/policy.ts"

const feed = (chunks: ReadonlyArray<string>) => {
  let pending = ""
  const values: Array<string> = []
  for (const chunk of chunks) {
    const [rest, found] = splitJsonValues(pending, chunk)
    pending = rest
    values.push(...found)
  }
  return { pending, values }
}

describe("splitJsonValues", () => {
  it("splits concatenated values in one chunk", () => {
    const { pending, values } = feed([`{"a":1}{"b":[2,3]}`])
    assert.deepStrictEqual(values, [`{"a":1}`, `{"b":[2,3]}`])
    assert.strictEqual(pending, "")
  })

  it("joins a value split across chunks", () => {
    const { values } = feed([`{"channel":"x","da`, `ta":{"type":"bind_error"`, `,"address":"0.0.0.0:30120"}}`])
    assert.deepStrictEqual(values, [`{"channel":"x","data":{"type":"bind_error","address":"0.0.0.0:30120"}}`])
  })

  it("ignores braces and escaped quotes inside strings", () => {
    const { values } = feed([`{"text":"a } \\" { b"}`, `\n{"n":1}\n`])
    assert.deepStrictEqual(values, [`{"text":"a } \\" { b"}`, `{"n":1}`])
  })

  it("keeps an unfinished value pending", () => {
    const { pending, values } = feed([`garbage {"a":`, `{"b":1}`])
    assert.deepStrictEqual(values, [])
    assert.strictEqual(pending, `{"a":{"b":1}`)
  })
})

describe("decodeTrace", () => {
  it("decodes a heartbeat from the monitored resource", () => {
    const trace = decodeTrace(
      JSON.stringify({
        channel: "citizen-server-impl",
        data: { type: "script_structured_trace", resource: "argus", payload: { type: "heartbeat" } }
      })
    )
    assert.isTrue(Option.isSome(trace))
    if (Option.isSome(trace) && trace.value.data.type === "script_structured_trace") {
      assert.isTrue(isHeartbeatPayload(trace.value.data.payload))
    }
  })

  it("decodes native FXServer events", () => {
    const bind = decodeTrace(`{"channel":"citizen-server-impl","data":{"type":"bind_error","address":"0.0.0.0:30120"}}`)
    const bark = decodeTrace(`{"channel":"citizen-server-impl","data":{"type":"watchdog_bark","thread":"svMain","stack":"root"}}`)
    assert.isTrue(Option.isSome(bind))
    assert.isTrue(Option.isSome(bark))
  })

  it("drops unknown or malformed traces", () => {
    assert.isTrue(Option.isNone(decodeTrace(`{"channel":"x","data":{"type":"script_log","message":"hi"}}`)))
    assert.isTrue(Option.isNone(decodeTrace(`{"channel":"x"`)))
    assert.isTrue(Option.isNone(decodeTrace(`{"channel":"x","data":{"type":"bind_error"}}`)))
  })
})

describe("sanitizeCommand", () => {
  it("neutralizes command chaining and line breaks", () => {
    assert.strictEqual(sanitizeCommand(" say hi; quit\r\nrestart x "), "say hi; quit restart x")
  })

  it("recognizes quit commands", () => {
    assert.isTrue(isQuitCommand("quit"))
    assert.isTrue(isQuitCommand("QUIT server update"))
    assert.isFalse(isQuitCommand("quitter"))
  })
})

describe("restart policy", () => {
  it("doubles the delay after each crash up to the cap", () => {
    const failure = new Crashed({ exitCode: 1 })
    const delays = [1, 2, 3, 4, 5, 6, 7].map((attempt) => Duration.toSeconds(restartDelay(failure, attempt, defaultSettings)))
    assert.deepStrictEqual(delays, [2, 4, 8, 16, 32, 60, 60])
  })

  it("grows the delay linearly while the port is busy", () => {
    const failure = new PortInUse({ address: "0.0.0.0:30120" })
    const delays = [1, 2, 9, 10].map((attempt) => Duration.toSeconds(restartDelay(failure, attempt, defaultSettings)))
    assert.deepStrictEqual(delays, [5, 10, 45, 45])
  })

  it("does not retry when the executable cannot start", () => {
    assert.isFalse(isRetryable(new SpawnFailed({ message: "ENOENT" })))
    assert.isTrue(isRetryable(new BootTimeout({ waitedMs: 1000 })))
  })
})
