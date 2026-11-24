import { execFile } from "node:child_process"

import { Context, Effect, Layer, Option } from "effect"

import { ServerConfig } from "../config.ts"
import { SourceLocator } from "../diagnostics/source-locator.ts"
import { BRANCH_FORMAT, parseBlame, parseBranches, parseStatus, resourceOfPath, type Blame, type Branch, type DriftEntry } from "./parse.ts"

const GIT_TIMEOUT_MS = 10_000
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

const git = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.tryPromise(
    () =>
      new Promise<string>((resolve, reject) => {
        execFile(
          "git",
          ["-c", "core.quotepath=false", ...args],
          { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
          (error, stdout) => (error ? reject(error) : resolve(stdout))
        )
      })
  )

const make = Effect.gen(function*() {
  const settings = yield* ServerConfig
  const locator = yield* SourceLocator

  const head = Effect.gen(function*() {
    if (settings.resourcesPath === undefined) return Option.none<string>()
    const output = yield* git(settings.resourcesPath, ["rev-parse", "--short=7", "HEAD"])
    return Option.some(output.trim())
  }).pipe(Effect.orElseSucceed(() => Option.none<string>()))

  const drift = Effect.gen(function*() {
    if (settings.resourcesPath === undefined) return [] as Array<DriftEntry>
    const output = yield* git(settings.resourcesPath, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "."])
    const prefix = (yield* git(settings.resourcesPath, ["rev-parse", "--show-prefix"])).trim()
    return parseStatus(output).map((entry) => {
      const path = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path
      const resource = resourceOfPath(path)
      return { path, state: entry.state, ...(resource === undefined ? {} : { resource }) }
    })
  }).pipe(Effect.orElseSucceed(() => [] as Array<DriftEntry>))

  const blame = (resource: string, file: string, line: number): Effect.Effect<Option.Option<Blame>> =>
    Effect.gen(function*() {
      const folder = yield* locator.folder(resource)
      if (Option.isNone(folder)) return Option.none<Blame>()
      const output = yield* git(folder.value, ["blame", "--porcelain", "-L", `${line},${line}`, "--", file])
      return Option.fromNullishOr(parseBlame(output))
    }).pipe(Effect.orElseSucceed(() => Option.none<Blame>()))

  const branches = Effect.gen(function*() {
    if (settings.resourcesPath === undefined) return [] as Array<Branch>
    const current = (yield* git(settings.resourcesPath, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()
    const output = yield* git(settings.resourcesPath, ["for-each-ref", `--format=${BRANCH_FORMAT}`, "refs/heads", "refs/remotes/origin"])
    return parseBranches(output, current)
  }).pipe(Effect.orElseSucceed(() => [] as Array<Branch>))

  return Repository.of({ head, drift, blame, branches })
})

export class Repository extends Context.Service<Repository, {
  readonly head: Effect.Effect<Option.Option<string>>
  readonly drift: Effect.Effect<ReadonlyArray<DriftEntry>>
  readonly branches: Effect.Effect<ReadonlyArray<Branch>>
  blame(resource: string, file: string, line: number): Effect.Effect<Option.Option<Blame>>
}>()("argus/agent/Repository") {
  static readonly layer = Layer.effect(Repository, make)
}
