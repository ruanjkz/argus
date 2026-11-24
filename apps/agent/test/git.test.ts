import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, Schedule } from "effect"
import { afterAll, beforeAll } from "vitest"

import { Diagnostics } from "../src/diagnostics/service.ts"
import { parseBlame, parseStatus, resourceOfPath } from "../src/git/parse.ts"
import { Repository } from "../src/git/repository.ts"
import { Supervisor } from "../src/supervisor.ts"
import { diagnosticsLayer, repositoryLayer } from "./support.ts"

let root = ""
let resources = ""

const git = (...args: Array<string>) =>
  execFileSync("git", ["-c", "user.name=Lia", "-c", "user.email=lia@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd: root,
    stdio: "pipe"
  })

const write = (path: string, content: string) => {
  const file = join(resources, path)
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, content)
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "argus-git-"))
  resources = join(root, "resources")
  git("init", "-q")
  write("[gameplay]/shop/fxmanifest.lua", "fx_version 'cerulean'\n")
  write("[gameplay]/shop/server/main.lua", Array.from({ length: 90 }, (_, index) => `local line${index + 1} = ${index + 1}`).join("\n") + "\n")
  write("[gameplay]/shop/config.lua", "Config = {}\n")
  write("[gameplay]/bank/fxmanifest.lua", "fx_version 'cerulean'\n")
  git("add", "-A")
  git("commit", "-q", "-m", "Add shop and bank")
  const lines = Array.from({ length: 90 }, (_, index) => (index === 87 ? "local price = item.price" : `local line${index + 1} = ${index + 1}`))
  write("[gameplay]/shop/server/main.lua", lines.join("\n") + "\n")
  git("add", "-A")
  git("commit", "-q", "-m", "Read price from the item")
  git("branch", "staging", "HEAD~1")
  write("[gameplay]/shop/config.lua", "Config = { debug = true }\n")
  write("[gameplay]/shop/notes.txt", "edited on the server\n")
  rmSync(join(resources, "[gameplay]/bank/fxmanifest.lua"))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("git parsing", () => {
  it("reads porcelain status records, including renames", () => {
    const entries = parseStatus(" M [gameplay]/shop/config.lua\0?? [gameplay]/shop/notes.txt\0R  new.lua\0old.lua\0 D bank/fxmanifest.lua\0")
    assert.deepStrictEqual(entries, [
      { path: "[gameplay]/shop/config.lua", state: "modified", resource: "shop" },
      { path: "[gameplay]/shop/notes.txt", state: "untracked", resource: "shop" },
      { path: "new.lua", state: "renamed" },
      { path: "bank/fxmanifest.lua", state: "deleted", resource: "bank" }
    ])
  })

  it("finds the resource under nested category folders", () => {
    assert.strictEqual(resourceOfPath("[a]/[b]/shop/server/main.lua"), "shop")
    assert.strictEqual(resourceOfPath("server.cfg"), undefined)
  })

  it("reads a blame record and spots uncommitted lines", () => {
    const committed = parseBlame(
      `${"a".repeat(40)} 88 88 1\nauthor Lia\nauthor-mail <lia@example.com>\nauthor-time 1700000000\nsummary Read price from the item\nfilename x.lua\n\tlocal price = item.price\n`
    )
    assert.deepStrictEqual(committed, {
      commit: "aaaaaaa",
      author: "Lia",
      time: 1_700_000_000_000,
      summary: "Read price from the item",
      uncommitted: false
    })
    const pending = parseBlame(`${"0".repeat(40)} 1 1 1\nauthor Not Committed Yet\nauthor-time 1700000000\nsummary x\n\tx\n`)
    assert.strictEqual(pending?.uncommitted, true)
    assert.strictEqual(parseBlame("fatal: no such path"), undefined)
  })
})

describe("Repository", () => {
  it.live("lists files changed on the server without a commit", () =>
    Effect.gen(function*() {
      const repository = yield* Repository
      const drift = yield* repository.drift
      assert.deepStrictEqual(
        [...drift].sort((first, second) => first.path.localeCompare(second.path)),
        [
          { path: "[gameplay]/bank/fxmanifest.lua", state: "deleted", resource: "bank" },
          { path: "[gameplay]/shop/config.lua", state: "modified", resource: "shop" },
          { path: "[gameplay]/shop/notes.txt", state: "untracked", resource: "shop" }
        ]
      )
      assert.isTrue(Option.isSome(yield* repository.head))
    }).pipe(Effect.provide(repositoryLayer({ resourcesPath: resources }))))

  it.live("blames a line to the commit that last changed it", () =>
    Effect.gen(function*() {
      const repository = yield* Repository
      const blame = Option.getOrUndefined(yield* repository.blame("shop", "server/main.lua", 88))
      assert.strictEqual(blame?.summary, "Read price from the item")
      assert.strictEqual(blame?.author, "Lia")
      assert.strictEqual(blame?.uncommitted, false)
      const older = Option.getOrUndefined(yield* repository.blame("shop", "server/main.lua", 3))
      assert.strictEqual(older?.summary, "Add shop and bank")
      const edited = Option.getOrUndefined(yield* repository.blame("shop", "config.lua", 1))
      assert.strictEqual(edited?.uncommitted, true)
      assert.isTrue(Option.isNone(yield* repository.blame("missing", "server.lua", 1)))
    }).pipe(Effect.provide(repositoryLayer({ resourcesPath: resources }))))

  it.live("lists branches with the checked out one first", () =>
    Effect.gen(function*() {
      const repository = yield* Repository
      const branches = yield* repository.branches
      assert.strictEqual(branches.length, 2)
      assert.strictEqual(branches[0]?.current, true)
      assert.strictEqual(branches[0]?.summary, "Read price from the item")
      const staging = branches.find((branch) => branch.name === "staging")
      assert.strictEqual(staging?.summary, "Add shop and bank")
      assert.strictEqual(staging?.current, false)
      assert.strictEqual(staging?.remoteOnly, false)
    }).pipe(Effect.provide(repositoryLayer({ resourcesPath: resources }))))

  it.live("returns nothing outside a git repository", () =>
    Effect.gen(function*() {
      const repository = yield* Repository
      assert.deepStrictEqual(yield* repository.drift, [])
      assert.isTrue(Option.isNone(yield* repository.head))
    }).pipe(Effect.provide(repositoryLayer({ resourcesPath: tmpdir() }))))
})

describe("Diagnostics with git", () => {
  it.live("attaches the commit that introduced a script error", () =>
    Effect.gen(function*() {
      const supervisor = yield* Supervisor
      const diagnostics = yield* Diagnostics
      yield* supervisor.start
      yield* supervisor.status.pipe(
        Effect.filterOrFail((status) => status === "online", () => "pending" as const),
        Effect.retry(Schedule.spaced("50 millis")),
        Effect.timeout("5 seconds")
      )
      yield* supervisor.send("fake-error")
      const problem = yield* diagnostics.problems.pipe(
        Effect.map((problems) => problems.find((entry) => entry.kind === "script-error")),
        Effect.filterOrFail((entry) => entry !== undefined, () => "pending" as const),
        Effect.retry(Schedule.spaced("50 millis")),
        Effect.timeout("5 seconds")
      )
      assert.strictEqual(problem?.introducedBy?.summary, "Read price from the item")
      yield* supervisor.stop
    }).pipe(Effect.scoped, Effect.provide(diagnosticsLayer("normal", { resourcesPath: resources }))))
})
