import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assert, describe, it } from "@effect/vitest"
import { afterAll } from "vitest"

import { scanResources } from "../src/resources.ts"
import { Moderation, type OnlinePlayer } from "../src/moderation.ts"

const roots: Array<string> = []
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "argus-moderation-"))
  roots.push(root)
  const commands: Array<string> = []
  const banFile = join(root, "resources", "[argus]", "argus", "bans.json")
  const moderation = new Moderation(root, () => banFile, () => "Banned: {reason}", async (text) => void commands.push(text))
  return { root, commands, banFile, moderation }
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

const player = (id: number, name: string, extra: Array<string> = [], tokens: Array<string> = []): OnlinePlayer => ({
  id,
  name,
  ping: 40,
  identifiers: [`license:${name}`, `discord:${id}`, ...extra],
  tokens
})

describe("Moderation", () => {
  it("remembers players and adds play time between snapshots", () => {
    const { moderation } = setup()
    moderation.onPlayers([player(1, "kxng")], 1_000_000)
    moderation.onPlayers([player(1, "kxng")], 1_030_000)
    const [kxng] = moderation.players(1_030_000)
    assert.strictEqual(kxng?.online, true)
    assert.strictEqual(kxng?.sessions, 1)
    assert.strictEqual(kxng?.serverId, 1)
    moderation.onPlayers([], 1_090_000)
    const [after] = moderation.players(1_150_000)
    assert.strictEqual(after?.online, false)
    assert.strictEqual(after?.lastSeenSeconds, 60)
  })

  it("links accounts that share a token and bans them together", async () => {
    const { moderation, commands, banFile } = setup()
    const now = Date.now()
    moderation.onPlayers([player(1, "kxng", [], ["4:abc"]), player(2, "kxng-alt", [], ["4:abc"])], now)
    const kxng = moderation.players(now).find((entry) => entry.name === "kxng")
    assert.deepStrictEqual(kxng?.linked, [{ key: "license:kxng-alt", reasons: ["same token"] }])
    await moderation.ban("ruan", "license:kxng", "Cheating", "7 days", true, now)
    const bans = moderation.bans(now)
    assert.strictEqual(bans.length, 2)
    assert.isTrue(bans.every((ban) => ban.status === "active"))
    assert.include(commands, "argus_reload_bans")
    assert.isTrue(commands.some((command) => command.startsWith("argus_kick 1 Banned: Cheating")))
    const written = JSON.parse(readFileSync(banFile, "utf8")) as { message: string; bans: Array<{ identifiers: Array<string> }> }
    assert.strictEqual(written.message, "Banned: {reason}")
    assert.isTrue(written.bans.some((ban) => ban.identifiers.includes("4:abc")))
  })

  it("revokes, expires and bans identifiers that never joined", async () => {
    const { moderation } = setup()
    const now = Date.now()
    await moderation.banIdentifier("ruan", "discord:998877", "Ban evasion", "1 day", now - 2 * 86_400_000)
    const [expired] = moderation.bans(now)
    assert.strictEqual(expired?.status, "expired")
    await moderation.banIdentifier("ruan", "license:abc", "Cheating", "Permanent", now)
    const active = moderation.bans(now).find((ban) => ban.status === "active")
    assert.strictEqual(active?.remainingSeconds, null)
    await moderation.revoke("ruan", active!.id, "Appeal accepted", now)
    assert.strictEqual(moderation.bans(now).find((ban) => ban.id === active!.id)?.status, "revoked")
    let failed = false
    await moderation.banIdentifier("ruan", "nope", "x", "1 day", now).catch(() => (failed = true))
    assert.isTrue(failed)
  })

  it("only kicks players who are online and strips command separators", async () => {
    const { moderation, commands } = setup()
    moderation.onPlayers([player(9, "dusk")], 1_000_000)
    await moderation.kick("lia", "license:dusk", "AFK; quit", 1_000_000)
    assert.include(commands, "argus_kick 9 Kicked: AFK quit")
    moderation.onPlayers([], 1_001_000)
    let failed = false
    await moderation.kick("lia", "license:dusk", "again", 1_001_000).catch(() => (failed = true))
    assert.isTrue(failed)
    assert.strictEqual(moderation.players(1_001_000)[0]?.history[0]?.type, "kick")
  })
})

describe("scanResources", () => {
  it("reads the bundled fixture resources", () => {
    const resources = scanResources(join(import.meta.dirname, "..", "fixtures", "resources"))
    const market = resources.find((resource) => resource.name === "market")
    assert.strictEqual(market?.folder, "[argus]")
  })
})
