import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, assert, beforeAll, describe, it } from "vitest"

import { Artifacts, buildOfExecutable, TAR } from "../src/artifacts.ts"
import { isNewer } from "../src/version.ts"

const windows = process.platform === "win32"
const executable = windows ? "FXServer.exe" : "run.sh"
const archiveName = windows ? "server.zip" : "fx.tar.xz"

let root = ""
let server: Server
let base = ""

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "argus-artifacts-"))
  const source = join(root, "source")
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, executable), "fake fxserver")
  writeFileSync(join(source, "citizen.dll"), "x".repeat(4096))
  const archive = join(root, archiveName)
  execFileSync(TAR, windows ? ["-a", "-cf", archive, "-C", source, "."] : ["-cJf", archive, "-C", source, "."])
  const broken = join(root, "broken.zip")
  writeFileSync(broken, "not an archive")
  server = createServer((request, response) => {
    if (request.url?.endsWith("/server")) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          recommended: "17000",
          recommended_download: `${base}/files/17000/${archiveName}`,
          latest: "17100",
          latest_download: `${base}/files/17100/broken.zip`,
          critical: "9000",
          critical_download: "https://evil.example/server.zip"
        })
      )
      return
    }
    const file = request.url?.includes("broken") ? broken : archive
    const data = readFileSync(file)
    response.writeHead(200, { "content-length": String(data.length) })
    response.end(data)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`
})

afterAll(() => {
  server?.close()
  rmSync(root, { recursive: true, force: true })
})

const waitFor = async (artifacts: Artifacts) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const job = artifacts.status()
    if (job && (job.phase === "done" || job.phase === "failed")) return job
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error("install did not finish")
}

describe("Artifacts", () => {
  it("downloads, extracts and lists a channel build", async () => {
    const home = join(root, "home-install")
    const artifacts = new Artifacts(home, base, new Set(["127.0.0.1"]))
    const channels = await artifacts.channels()
    assert.deepStrictEqual(
      channels.map(({ channel, build }) => `${channel}:${build}`),
      ["recommended:17000", "latest:17100", "critical:9000"]
    )
    await artifacts.install("recommended")
    const job = await waitFor(artifacts)
    assert.strictEqual(job.phase, "done", job.error ?? "")
    assert.isAbove(job.received, 0)
    assert.isTrue(existsSync(artifacts.executableFor("17000")))
    assert.deepStrictEqual(artifacts.installed().map((entry) => entry.build), ["17000"])
    assert.strictEqual(buildOfExecutable(artifacts.executableFor("17000")), "17000")
  })

  it("fails cleanly on a broken archive and refuses other hosts", async () => {
    const home = join(root, "home-broken")
    const artifacts = new Artifacts(home, base, new Set(["127.0.0.1"]))
    await artifacts.install("latest")
    const job = await waitFor(artifacts)
    assert.strictEqual(job.phase, "failed")
    assert.isFalse(existsSync(join(home, "artifacts", "17100")))
    let refused = ""
    await artifacts.install("critical").catch((error: Error) => (refused = error.message))
    assert.include(refused, "evil.example")
  })

  it("removes builds that are not in use", async () => {
    const home = join(root, "home-remove")
    const artifacts = new Artifacts(home, base, new Set(["127.0.0.1"]))
    await artifacts.install("recommended")
    await waitFor(artifacts)
    let blocked = ""
    try {
      artifacts.remove("17000", "17000")
    } catch (error) {
      blocked = (error as Error).message
    }
    assert.include(blocked, "in use")
    artifacts.remove("17000", "19253")
    assert.deepStrictEqual(artifacts.installed(), [])
  })
})

describe("versions", () => {
  it("compares release versions", () => {
    assert.isTrue(isNewer("v0.2.0", "0.1.9"))
    assert.isTrue(isNewer("0.1.10", "0.1.9"))
    assert.isFalse(isNewer("v0.1.0", "0.1.0"))
    assert.isFalse(isNewer("0.0.9", "0.1.0"))
    assert.strictEqual(buildOfExecutable("C:/FXServer/artifacts/19253-abc123/FXServer.exe"), "19253")
    assert.strictEqual(buildOfExecutable("C:/FXServer/server/FXServer.exe"), null)
  })
})
