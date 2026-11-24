import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assert, describe, it } from "@effect/vitest"
import { Duration } from "effect"
import { afterAll, beforeAll } from "vitest"

import { createArgusFile, defaultSettings, readArgusFile, splitArgs, toServerSettings, writeArgusFile } from "../src/home.ts"
import { checkDataFolder, checkExecutable, ensureInConfig, EXECUTABLE_NAMES, guessExecutable, guessName, hasEnsure, installResource } from "../src/install.ts"

let root = ""
let data = ""

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "argus-install-"))
  data = join(root, "server-data")
  mkdirSync(join(data, "resources"), { recursive: true })
  mkdirSync(join(root, "server"), { recursive: true })
  writeFileSync(join(root, "server", EXECUTABLE_NAMES[0] ?? "FXServer.exe"), "")
  writeFileSync(join(data, "server.cfg"), 'sv_hostname "^2Arena ^7PvP"\nensure chat')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("install checks", () => {
  it("accepts the server data folder and explains what is wrong otherwise", () => {
    assert.deepStrictEqual(checkDataFolder(data), { ok: true, value: data })
    assert.deepStrictEqual(checkDataFolder(`"${data}"`), { ok: true, value: data })
    const missing = checkDataFolder(join(root, "nope"))
    assert.isFalse(missing.ok)
    const noConfig = checkDataFolder(root)
    assert.isTrue(!noConfig.ok && noConfig.message.includes("No server.cfg"))
    assert.isFalse(checkDataFolder("  ").ok)
  })

  it("finds FXServer from the file or its folder, and guesses it from the data folder", () => {
    const executable = join(root, "server", EXECUTABLE_NAMES[0] ?? "")
    assert.deepStrictEqual(checkExecutable(join(root, "server")), { ok: true, value: executable })
    assert.deepStrictEqual(checkExecutable(executable), { ok: true, value: executable })
    assert.isFalse(checkExecutable(join(data, "server.cfg")).ok)
    assert.strictEqual(guessExecutable(data), executable)
  })

  it("names the server from sv_hostname without color codes", () => {
    assert.strictEqual(guessName(data), "arena-pvp")
  })
})

describe("install changes", () => {
  it("copies the resource and ensures it once, keeping a backup", () => {
    const first = installResource(data)
    assert.isFalse(first.updated)
    assert.isTrue(existsSync(join(first.path, "fxmanifest.lua")))
    assert.isTrue(installResource(data).updated)

    assert.isFalse(hasEnsure(data))
    const added = ensureInConfig(data)
    assert.isTrue(added.changed)
    assert.strictEqual(readFileSync(join(data, "server.cfg"), "utf8"), 'sv_hostname "^2Arena ^7PvP"\nensure chat\nensure argus\n')
    assert.strictEqual(readFileSync(join(data, "server.cfg.before-argus"), "utf8"), 'sv_hostname "^2Arena ^7PvP"\nensure chat')
    assert.isFalse(ensureInConfig(data).changed)
    assert.isTrue(hasEnsure(data))
  })
})

describe("argus.json", () => {
  it("round trips and turns panel settings into launch settings", () => {
    const home = join(root, "home")
    const file = createArgusFile({ ...defaultSettings("C:/fx/FXServer.exe", data, "arena"), launchArgs: '+set onesync on +set sv_projectName "Arena PvP"' })
    writeArgusFile(file, home)
    const loaded = readArgusFile(home)
    assert.strictEqual(loaded?.token, file.token)
    assert.strictEqual(loaded?.settings.name, "arena")
    const launch = toServerSettings(loaded!.settings, home)
    assert.deepStrictEqual(launch.args, ["+exec", "server.cfg", "+set", "onesync", "on", "+set", "sv_projectName", "Arena PvP"])
    assert.strictEqual(launch.cwd, data)
    assert.strictEqual(Duration.toSeconds(launch.stopTimeout!), 15)
    assert.strictEqual(launch.maxConsecutiveFailures, 5)
    assert.strictEqual(toServerSettings({ ...loaded!.settings, restartOnCrash: false }, home).maxConsecutiveFailures, 1)
    assert.deepStrictEqual(splitArgs(""), [])
    assert.strictEqual(readArgusFile(join(root, "missing")), undefined)
  })
})
