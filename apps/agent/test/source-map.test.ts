import { readFileSync } from "node:fs"
import path from "node:path"

import { assert, describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"

import { SourceLocator } from "../src/diagnostics/source-locator.ts"
import { decodeSegment, decodeSourceMap, originalPosition, type SourceMap } from "../src/diagnostics/source-map.ts"
import { fixtureResources, sourceLocatorLayer } from "./support.ts"

const marketMap = readFileSync(path.join(fixtureResources, "[argus]", "market", "dist", "server.js.map"), "utf8")

describe("source maps", () => {
  it("decodes base64 VLQ segments", () => {
    assert.deepStrictEqual(decodeSegment("AASA"), [0, 0, 9, 0])
    assert.deepStrictEqual(decodeSegment("IAC/B"), [4, 0, 1, -31])
    assert.deepStrictEqual(decodeSegment("not valid!"), [])
  })

  it("maps a bundle line back to the TypeScript line with a real compiler map", () => {
    const map = Option.getOrThrow(decodeSourceMap(marketMap))
    assert.deepStrictEqual(originalPosition(map, 7), { source: "../src/server.ts", line: 17 })
    assert.deepStrictEqual(originalPosition(map, 10), { source: "../src/server.ts", line: 21 })
    assert.isUndefined(originalPosition(map, 99))
  })

  it("refuses to guess when one line holds many original lines", () => {
    const minified: SourceMap = { sources: ["src/a.ts"], mappings: "AAAA,CACA,CACA,CACA,CACA" }
    assert.isUndefined(originalPosition(minified, 1))
    assert.isTrue(Option.isNone(decodeSourceMap("{ not json")))
  })
})

describe("SourceLocator", () => {
  it.live("finds a resource inside a category folder and resolves the original file", () =>
    Effect.gen(function*() {
      const locator = yield* SourceLocator
      const found = yield* locator.resolve({ resource: "market", file: "dist/server.js", line: 7 })
      assert.deepStrictEqual(Option.getOrUndefined(found), { file: "src/server.ts", line: 17 })
    }).pipe(Effect.provide(sourceLocatorLayer())))

  it.live("returns nothing for Lua files, unknown resources and missing folders", () =>
    Effect.gen(function*() {
      const locator = yield* SourceLocator
      assert.isTrue(Option.isNone(yield* locator.resolve({ resource: "market", file: "server.lua", line: 3 })))
      assert.isTrue(Option.isNone(yield* locator.resolve({ resource: "ghost", file: "dist/server.js", line: 7 })))
      assert.isTrue(Option.isNone(yield* locator.resolve({ resource: "market", file: "dist/missing.js", line: 7 })))
    }).pipe(Effect.provide(sourceLocatorLayer())))

  it.live("stays quiet when no resources path is configured", () =>
    Effect.gen(function*() {
      const locator = yield* SourceLocator
      assert.isTrue(Option.isNone(yield* locator.resolve({ resource: "market", file: "dist/server.js", line: 7 })))
    }).pipe(Effect.provide(sourceLocatorLayer({ resourcesPath: undefined }))))
})
