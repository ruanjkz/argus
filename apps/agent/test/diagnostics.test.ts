import { assert, describe, it } from "@effect/vitest"
import { Effect, Schedule } from "effect"

import { computeImpact, formatDuration, type Occurrence } from "../src/diagnostics/impact.ts"
import type { Problem } from "../src/diagnostics/model.ts"
import { diagnose } from "../src/diagnostics/rules.ts"
import { Diagnostics } from "../src/diagnostics/service.ts"
import { normalizeMessage, parseLocation, parseSignal } from "../src/diagnostics/signals.ts"
import { Supervisor } from "../src/supervisor.ts"
import { diagnosticsLayer } from "./support.ts"

const NOW = 10_000_000
const occurrence = (overrides: Partial<Occurrence> = {}): Occurrence => ({
  time: NOW - 60_000,
  players: 48,
  durationMs: 0,
  ongoingSince: undefined,
  ...overrides
})

describe("parseSignal", () => {
  it("reads a script error with its channel colors, resource and line", () => {
    const signal = parseSignal(
      "\u001b[97m[        script:shop]\u001b[0m SCRIPT ERROR: @shop/server/main.lua:88: attempt to index a nil value (field 'price')"
    )
    assert.deepStrictEqual(signal, {
      kind: "script-error",
      resource: "shop",
      location: { resource: "shop", file: "server/main.lua", line: 88 },
      message: "attempt to index a nil value (field 'price')"
    })
  })

  it("falls back to the channel when the error has no file", () => {
    const signal = parseSignal("[   script:garage] SCRIPT ERROR: error object is not a string")
    assert.strictEqual(signal?.kind, "script-error")
    if (signal?.kind === "script-error") {
      assert.strictEqual(signal.resource, "garage")
      assert.isUndefined(signal.location)
    }
  })

  it("reads thread stalls and resource failures", () => {
    assert.deepStrictEqual(
      parseSignal("[ citizen-server-impl] server thread hitch warning: timer interval of 4100 milliseconds"),
      { kind: "hitch", thread: "server", milliseconds: 4100 }
    )
    assert.deepStrictEqual(parseSignal("[          resources] Couldn't start resource bank."), {
      kind: "resource-error",
      resource: "bank",
      message: "Couldn't start resource bank."
    })
  })

  it("ignores ordinary console lines and stack frames", () => {
    assert.isUndefined(parseSignal("[          resources] Started resource shop"))
    assert.isUndefined(parseSignal("[        script:shop] > handler (@shop/server/main.lua:88)"))
  })

  it("groups messages that only differ by numbers", () => {
    assert.strictEqual(
      normalizeMessage("player 12 has no item 0x1F at slot 3"),
      normalizeMessage("player 907 has no item 0xAA at slot 14")
    )
    assert.deepStrictEqual(parseLocation("@inventory/server/tick.lua:212\n@inventory/server/main.lua:48"), {
      resource: "inventory",
      file: "server/tick.lua",
      line: 212
    })
  })
})

describe("diagnose", () => {
  const location = { resource: "shop", file: "server/main.lua", line: 88 }

  it("names the nil field and the line for an index error", () => {
    const diagnosis = diagnose({
      kind: "script-error",
      resource: "shop",
      location,
      message: "attempt to index a nil value (field 'price')"
    })
    assert.strictEqual(diagnosis?.rule, "lua-index-nil")
    assert.include(diagnosis?.cause ?? "", "field \"price\"")
    assert.include(diagnosis?.cause ?? "", "shop/server/main.lua:88")
    assert.strictEqual(diagnosis?.confidence, "likely")
  })

  it("points at load order for a missing function or export", () => {
    const call = diagnose({
      kind: "script-error",
      resource: "shop",
      location,
      message: "attempt to call a nil value (global 'GetItemPrice')"
    })
    assert.strictEqual(call?.rule, "lua-call-nil")
    assert.isTrue(call?.steps.some((step) => step.includes("starts before shop")))

    const missingExport = diagnose({
      kind: "resource-error",
      resource: "shop",
      location: undefined,
      message: "No such export getPrice in resource economy"
    })
    assert.strictEqual(missingExport?.rule, "export-missing")
    assert.include(missingExport?.cause ?? "", "economy")
  })

  it("covers hangs and lifecycle failures without a message pattern", () => {
    assert.strictEqual(
      diagnose({ kind: "thread-hang", resource: "inventory", location: undefined, message: "hung" })?.rule,
      "thread-hang"
    )
    assert.strictEqual(
      diagnose({ kind: "port-in-use", resource: undefined, location: undefined, message: "Port busy" })?.rule,
      "port-in-use"
    )
  })

  it("returns nothing when no rule matches", () => {
    assert.isUndefined(
      diagnose({ kind: "script-error", resource: "shop", location, message: "something nobody has seen before" })
    )
  })
})

describe("computeImpact", () => {
  it("measures a hang in frozen player time", () => {
    const impact = computeImpact("thread-hang", 1, [occurrence({ durationMs: 4100 })], NOW)
    assert.strictEqual(impact.summary, "Froze 48 players for 4.1s")
    assert.strictEqual(impact.disruptedPlayerSeconds, 196.8)
    assert.strictEqual(impact.severity, "high")
  })

  it("counts script errors and only the last hour as recent", () => {
    const occurrences = [occurrence({ time: NOW - 7_200_000 }), occurrence(), occurrence({ time: NOW - 1000 })]
    const impact = computeImpact("script-error", 22, occurrences, NOW)
    assert.strictEqual(impact.summary, "22 times, 2 in the last hour with 48 players online")
    assert.strictEqual(impact.lastHour, 2)
    assert.strictEqual(impact.severity, "low")
  })

  it("keeps counting downtime while the server is still offline", () => {
    const ongoing = computeImpact("crashed", 1, [occurrence({ players: 47, ongoingSince: NOW - 38_000 })], NOW)
    assert.strictEqual(ongoing.summary, "Server has been offline for 38.0s, 47 players disconnected")
    assert.strictEqual(ongoing.severity, "critical")

    const empty = computeImpact("crashed", 1, [occurrence({ players: 0, durationMs: 2000 })], NOW)
    assert.strictEqual(empty.summary, "Server was offline for 2.0s")
    assert.strictEqual(empty.severity, "high")
  })

  it("reports the worst stall", () => {
    const impact = computeImpact("hitch", 3, [occurrence({ durationMs: 180 }), occurrence({ durationMs: 420 })], NOW)
    assert.strictEqual(impact.summary, "2 stalls in the last hour, worst 420 ms with 48 players online")
    assert.strictEqual(formatDuration(95_000), "1m 35s")
  })
})

const waitForProblems = (
  diagnostics: Diagnostics["Service"],
  ready: (problems: ReadonlyArray<Problem>) => boolean
) =>
  diagnostics.problems.pipe(
    Effect.flatMap((problems) => ready(problems) ? Effect.succeed(problems) : Effect.fail("pending" as const)),
    Effect.retry(Schedule.spaced("50 millis")),
    Effect.timeout("15 seconds")
  )

describe("Diagnostics", () => {
  it.live("groups script errors, stalls and hangs from a running server", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      const diagnostics = yield* Diagnostics
      yield* supervisor.start

      const problems = yield* waitForProblems(diagnostics, (list) =>
        list.some((problem) => problem.kind === "script-error" && problem.count === 3) &&
        list.some((problem) => problem.kind === "thread-hang" && problem.impact.worstMs === 4100) &&
        list.some((problem) => problem.kind === "hitch"))

      const scriptError = problems.find((problem) => problem.kind === "script-error")
      assert.strictEqual(scriptError?.resource, "shop")
      assert.deepStrictEqual(scriptError?.location, { resource: "shop", file: "server/main.lua", line: 88 })
      assert.strictEqual(scriptError?.diagnosis?.rule, "lua-index-nil")
      assert.strictEqual(scriptError?.impact.players, 48)

      const hang = problems.find((problem) => problem.kind === "thread-hang")
      assert.strictEqual(hang?.resource, "inventory")
      assert.strictEqual(hang?.impact.summary, "Froze 48 players for 4.1s")
      assert.strictEqual(hang?.count, 1)

      const stall = problems.find((problem) => problem.kind === "hitch")
      assert.strictEqual(stall?.count, 1)
      assert.strictEqual(stall?.impact.worstMs, 180)

      assert.strictEqual(problems[0]?.kind, "thread-hang")
    }).pipe(Effect.provide(diagnosticsLayer("noisy"))))

  it.live("measures downtime and lost players after a crash", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      const diagnostics = yield* Diagnostics
      yield* supervisor.start

      const problems = yield* waitForProblems(diagnostics, (list) =>
        list.some((problem) => problem.kind === "crashed" && problem.impact.worstMs > 0 && !problem.impact.summary.includes("has been")))

      const crash = problems.find((problem) => problem.kind === "crashed")
      assert.match(crash?.impact.summary ?? "", /^Server was offline for .+, 48 players disconnected/)
      assert.strictEqual(crash?.diagnosis?.rule, "crashed")
      assert.isTrue((crash?.impact.disruptedPlayerSeconds ?? 0) > 0)
    }).pipe(Effect.provide(diagnosticsLayer("crash"))))
})
