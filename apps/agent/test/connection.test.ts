import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { afterAll, beforeAll } from "vitest"

import { ServerConfig } from "../src/config.ts"
import { GitConnection } from "../src/git/connection.ts"
import { classifyFailure, parseRemote, parseRemoteHeads } from "../src/git/remote.ts"

let root = ""
let bare = ""

const layer = (dataPath: string | undefined) =>
  GitConnection.layer.pipe(
    Layer.provide(ServerConfig.layer({ executable: "unused", dataPath })),
    Layer.provide(NodeServices.layer)
  )

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "argus-connection-"))
  const work = join(root, "work")
  bare = join(root, "remote.git")
  const git = (cwd: string, ...args: Array<string>) =>
    execFileSync("git", ["-c", "user.name=Lia", "-c", "user.email=lia@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" })
  git(root, "init", "-q", "-b", "main", work)
  writeFileSync(join(work, "server.cfg"), "sv_maxclients 64\n")
  git(work, "add", "-A")
  git(work, "commit", "-q", "-m", "First commit")
  git(work, "branch", "staging")
  git(root, "clone", "-q", "--bare", work, bare)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("parseRemote", () => {
  it("accepts every way people paste a GitHub repository", () => {
    const expected = {
      host: "github.com",
      owner: "arena-team",
      name: "arena-server",
      sshUrl: "git@github.com:arena-team/arena-server.git",
      webUrl: "https://github.com/arena-team/arena-server",
      deployKeysUrl: "https://github.com/arena-team/arena-server/settings/keys/new"
    }
    for (const input of [
      "git@github.com:arena-team/arena-server.git",
      "https://github.com/arena-team/arena-server",
      "https://github.com/arena-team/arena-server.git",
      "https://github.com/arena-team/arena-server/tree/main/resources",
      "  arena-team/arena-server  ",
      "ssh://git@github.com/arena-team/arena-server.git"
    ]) {
      assert.deepStrictEqual(parseRemote(input), expected, input)
    }
  })

  it("keeps other hosts and rejects text that is not a repository", () => {
    assert.strictEqual(parseRemote("git@git.example.com:team/server.git")?.deployKeysUrl, undefined)
    assert.strictEqual(parseRemote("https://gitlab.com/team/server")?.sshUrl, "git@gitlab.com:team/server.git")
    assert.strictEqual(parseRemote("arena-server"), undefined)
    assert.strictEqual(parseRemote("https://github.com/arena-team"), undefined)
    assert.strictEqual(parseRemote(""), undefined)
  })
})

describe("classifyFailure", () => {
  it("names the reason behind a refused connection", () => {
    assert.strictEqual(classifyFailure("git@github.com: Permission denied (publickey)."), "key-not-added")
    assert.strictEqual(classifyFailure("ERROR: Repository not found."), "repository-not-found")
    assert.strictEqual(classifyFailure("ssh: Could not resolve hostname github.com"), "host-unreachable")
    assert.strictEqual(classifyFailure("ssh: connect to host github.com port 22: Connection timed out"), "timed-out")
    assert.strictEqual(classifyFailure("spawn git ENOENT"), "ssh-missing")
    assert.strictEqual(classifyFailure("something else"), "unknown")
  })

  it("reads branch names from ls-remote output", () => {
    assert.deepStrictEqual(parseRemoteHeads("abc\trefs/heads/main\ndef\trefs/heads/feature/x\nghi\trefs/tags/v1\n"), ["main", "feature/x"])
  })
})

describe("GitConnection", () => {
  it.live("creates the deploy key once and reuses it", () =>
    Effect.gen(function*() {
      const connection = yield* GitConnection
      const first = yield* connection.deployKey("argus-arena-01")
      assert.isTrue(first.publicKey.startsWith("ssh-ed25519 "))
      assert.isTrue(first.publicKey.endsWith("argus-arena-01"))
      assert.isTrue(first.fingerprint.startsWith("SHA256:"))
      assert.isTrue(existsSync(first.path))
      const second = yield* connection.deployKey("another-label")
      assert.strictEqual(second.publicKey, first.publicKey)
    }).pipe(Effect.provide(layer(join(root, "data")))))

  it.live("lists the branches of a repository it can reach", () =>
    Effect.gen(function*() {
      const connection = yield* GitConnection
      const branches = yield* connection.test(bare)
      assert.deepStrictEqual([...branches].sort(), ["main", "staging"])
    }).pipe(Effect.provide(layer(join(root, "data")))))

  it.live("explains why a repository cannot be reached", () =>
    Effect.gen(function*() {
      const connection = yield* GitConnection
      const error = yield* connection.test(join(root, "missing.git")).pipe(Effect.flip)
      assert.strictEqual(error._tag, "ConnectionRefused")
      assert.strictEqual(error._tag === "ConnectionRefused" ? error.reason : "", "repository-not-found")
    }).pipe(Effect.provide(layer(join(root, "data")))))

  it.live("fails clearly without a data folder", () =>
    Effect.gen(function*() {
      const connection = yield* GitConnection
      const error = yield* connection.deployKey("x").pipe(Effect.flip)
      assert.strictEqual(error._tag, "KeyUnavailable")
    }).pipe(Effect.provide(layer(undefined))))
})
