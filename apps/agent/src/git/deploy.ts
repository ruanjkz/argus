import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

import { resourceOfPath } from "./parse.ts"

const TIMEOUT_MS = 60_000
const SEPARATOR = "\u001f"

export class DeployError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export interface Commit {
  commit: string
  message: string
  author: string
  time: number
}

export interface FileChange {
  path: string
  added: number
  removed: number
}

export interface ResourceChange {
  resource: string
  folder: string
  kind: "changed" | "added" | "removed"
  files: Array<FileChange>
}

export class GitDeploy {
  constructor(
    private readonly folder: () => string | undefined,
    private readonly keyPath: () => string,
    private readonly remoteUrl: () => string | undefined
  ) {}

  private run(args: ReadonlyArray<string>, network = false) {
    const cwd = this.folder()
    if (!cwd || !existsSync(cwd)) return Promise.reject(new DeployError(409, "The resources folder is missing"))
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    if (network && existsSync(this.keyPath())) {
      env.GIT_SSH_COMMAND = `ssh -i "${this.keyPath().replaceAll("\\", "/")}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new`
    }
    return new Promise<string>((resolve, reject) => {
      execFile("git", ["-c", "core.quotepath=false", ...args], { cwd, env, timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
        error ? reject(new DeployError(500, (stderr || error.message).trim().split("\n").slice(-2).join(" "))) : resolve(stdout)
      )
    })
  }

  async isRepository() {
    try {
      return (await this.run(["rev-parse", "--is-inside-work-tree"])).trim() === "true"
    } catch {
      return false
    }
  }

  async currentBranch() {
    return (await this.run(["rev-parse", "--abbrev-ref", "HEAD"])).trim()
  }

  async head() {
    return (await this.run(["rev-parse", "--short=7", "HEAD"])).trim()
  }

  async log(range: string, limit = 30): Promise<Array<Commit>> {
    const output = await this.run(["log", `-${limit}`, `--format=%h${SEPARATOR}%s${SEPARATOR}%an${SEPARATOR}%ct`, range])
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [commit = "", message = "", author = "", time = "0"] = line.split(SEPARATOR)
        return { commit, message, author, time: Number(time) * 1000 }
      })
  }

  async changes(range: string): Promise<Array<ResourceChange>> {
    const numstat = await this.run(["diff", "--numstat", range, "--", "."])
    const status = await this.run(["diff", "--name-status", range, "--", "."])
    const kinds = new Map<string, string>()
    for (const line of status.split("\n").filter(Boolean)) {
      const [kind = "M", ...paths] = line.split("\t")
      kinds.set(paths[paths.length - 1] ?? "", kind[0] ?? "M")
    }
    const prefix = (await this.run(["rev-parse", "--show-prefix"])).trim()
    const groups = new Map<string, ResourceChange>()
    for (const line of numstat.split("\n").filter(Boolean)) {
      const [added = "0", removed = "0", fullPath = ""] = line.split("\t")
      const path = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath
      const resource = resourceOfPath(path) ?? "(root)"
      const segments = path.split("/")
      const index = segments.indexOf(resource)
      const folder = index > 0 ? segments.slice(0, index).join("/") : ""
      const file = index >= 0 ? segments.slice(index + 1).join("/") : path
      const key = `${folder}/${resource}`
      const group = groups.get(key) ?? { resource, folder, kind: "changed" as const, files: [] }
      group.files.push({ path: file, added: Number(added) || 0, removed: Number(removed) || 0 })
      groups.set(key, group)
    }
    for (const group of groups.values()) {
      const fileKinds = group.files.map((file) => kinds.get(`${prefix}${group.folder ? `${group.folder}/` : ""}${group.resource}/${file.path}`))
      if (fileKinds.every((kind) => kind === "A")) group.kind = "added"
      else if (fileKinds.every((kind) => kind === "D")) group.kind = "removed"
    }
    return [...groups.values()]
  }

  async fetch(branch: string) {
    const remote = this.remoteUrl()
    if (remote) await this.run(["remote", "set-url", "origin", remote]).catch(() => this.run(["remote", "add", "origin", remote]))
    await this.run(["fetch", "--prune", "origin", branch], true)
  }

  async branches() {
    const output = await this.run(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"])
    return output
      .split("\n")
      .map((line) => line.trim().replace(/^origin\//, ""))
      .filter((name) => name && name !== "HEAD" && name !== "origin")
  }

  async fastForward(branch: string) {
    const current = await this.currentBranch()
    if (current !== branch) throw new DeployError(409, `The resources folder is on ${current}, not ${branch}. Switch the branch first.`)
    await this.run(["merge", "--ff-only", `origin/${branch}`])
  }

  async switchBranch(branch: string) {
    await this.fetch(branch)
    await this.run(["checkout", "-B", branch, `origin/${branch}`])
  }
}

export const deployKeyPath = (home: string) => join(home, "keys", "deploy_ed25519")
