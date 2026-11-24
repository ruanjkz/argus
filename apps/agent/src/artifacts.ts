import { execFile } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs"
import { basename, join, resolve, sep } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

export type Channel = "recommended" | "latest" | "optional" | "critical"

export interface ChannelBuild {
  channel: Channel
  build: string
  url: string
}

export interface InstallJob {
  build: string
  channel: Channel
  phase: "downloading" | "extracting" | "done" | "failed"
  received: number
  total: number | null
  error: string | null
  startedAt: number
}

export class ArtifactError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const CHANNELS: ReadonlyArray<Channel> = ["recommended", "latest", "optional", "critical"]
const DEFAULT_API = "https://changelogs-live.fivem.net/api/changelog/versions"
const ALLOWED_HOSTS = new Set(["runtime.fivem.net"])
const CACHE_MS = 10 * 60_000
const BUILD_PATTERN = /^\d{3,6}$/
const EXECUTABLE = process.platform === "win32" ? "FXServer.exe" : "run.sh"
const PLATFORM = process.platform === "win32" ? "win32" : "linux"
export const TAR = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe") : "tar"

const run = (command: string, args: ReadonlyArray<string>) =>
  new Promise<void>((resolvePromise, reject) => {
    execFile(command, [...args], { windowsHide: true, timeout: 10 * 60_000 }, (error, _stdout, stderr) =>
      error ? reject(new Error((stderr || error.message).trim())) : resolvePromise()
    )
  })

export const buildOfExecutable = (executable: string) => {
  const parts = resolve(executable).split(sep)
  for (let index = parts.length - 2; index >= 0; index--) {
    const part = parts[index] ?? ""
    const match = /^(\d{3,6})(?:-[0-9a-f]+)?$/.exec(part)
    if (match?.[1]) return match[1]
  }
  return null
}

export class Artifacts {
  private cache: { at: number; channels: Array<ChannelBuild> } | undefined
  private job: InstallJob | undefined

  constructor(
    private readonly home: string,
    private readonly apiBase = process.env.ARGUS_ARTIFACTS_API ?? DEFAULT_API,
    private readonly allowedHosts: ReadonlySet<string> = process.env.ARGUS_ARTIFACTS_API ? new Set(["127.0.0.1", "localhost"]) : ALLOWED_HOSTS
  ) {}

  get folder() {
    return join(this.home, "artifacts")
  }

  executableFor(build: string) {
    return join(this.folder, build, EXECUTABLE)
  }

  async channels(): Promise<Array<ChannelBuild>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.channels
    const response = await fetch(`${this.apiBase}/${PLATFORM}/server`, { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new ArtifactError(502, `The FiveM artifact list answered ${response.status}`)
    const data = (await response.json()) as Record<string, unknown>
    const channels: Array<ChannelBuild> = []
    for (const channel of CHANNELS) {
      const build = data[channel]
      const url = data[`${channel}_download`]
      if (typeof build === "string" && typeof url === "string" && BUILD_PATTERN.test(build)) channels.push({ channel, build, url })
    }
    this.cache = { at: Date.now(), channels }
    return channels
  }

  installed() {
    if (!existsSync(this.folder)) return [] as Array<{ build: string; path: string; installedAt: number }>
    return readdirSync(this.folder)
      .filter((entry) => BUILD_PATTERN.test(entry) && existsSync(this.executableFor(entry)))
      .map((build) => ({ build, path: this.executableFor(build), installedAt: statSync(join(this.folder, build)).mtimeMs }))
      .sort((first, second) => Number(second.build) - Number(first.build))
  }

  status() {
    return this.job
  }

  async install(channel: Channel) {
    if (this.job && (this.job.phase === "downloading" || this.job.phase === "extracting")) {
      throw new ArtifactError(409, `Build ${this.job.build} is still being installed`)
    }
    const target = (await this.channels()).find((entry) => entry.channel === channel)
    if (!target) throw new ArtifactError(404, "That channel has no build right now")
    const url = new URL(target.url)
    if (!this.allowedHosts.has(url.hostname)) throw new ArtifactError(400, `Refusing a download from ${url.hostname}`)
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost"
    if (url.protocol !== "https:" && !loopback) throw new ArtifactError(400, "Refusing a download that is not https")
    if (existsSync(this.executableFor(target.build))) {
      this.job = { build: target.build, channel, phase: "done", received: 0, total: null, error: null, startedAt: Date.now() }
      return this.job
    }
    const job: InstallJob = { build: target.build, channel, phase: "downloading", received: 0, total: null, error: null, startedAt: Date.now() }
    this.job = job
    void this.download(job, url).catch((error: unknown) => {
      job.phase = "failed"
      job.error = error instanceof Error ? error.message : String(error)
    })
    return job
  }

  private async download(job: InstallJob, url: URL) {
    mkdirSync(this.folder, { recursive: true })
    const archive = join(this.folder, `.download-${job.build}-${basename(url.pathname)}`)
    const staging = join(this.folder, `.extract-${job.build}`)
    const destination = join(this.folder, job.build)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) })
      if (!response.ok || !response.body) throw new Error(`Download answered ${response.status}`)
      const length = Number(response.headers.get("content-length"))
      job.total = Number.isFinite(length) && length > 0 ? length : null
      const counter = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          job.received += chunk.byteLength
          controller.enqueue(chunk)
        }
      })
      await pipeline(Readable.fromWeb(response.body.pipeThrough(counter) as never), createWriteStream(archive))
      job.phase = "extracting"
      rmSync(staging, { recursive: true, force: true })
      mkdirSync(staging, { recursive: true })
      await run(TAR, ["-xf", archive, "-C", staging])
      if (!existsSync(join(staging, EXECUTABLE))) throw new Error(`The archive has no ${EXECUTABLE}`)
      rmSync(destination, { recursive: true, force: true })
      renameSync(staging, destination)
      job.phase = "done"
    } finally {
      rmSync(archive, { force: true })
      rmSync(staging, { recursive: true, force: true })
    }
  }

  remove(build: string, current: string | null) {
    if (!BUILD_PATTERN.test(build)) throw new ArtifactError(400, "Pick a build")
    if (build === current) throw new ArtifactError(409, "That build is in use. Switch to another one first.")
    const folder = join(this.folder, build)
    if (!existsSync(folder)) throw new ArtifactError(404, "That build is not installed")
    rmSync(folder, { recursive: true, force: true })
  }
}
