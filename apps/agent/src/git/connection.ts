import { execFile } from "node:child_process"

import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect"

import { ServerConfig } from "../config.ts"
import { classifyFailure, ConnectionFailure, parseRemoteHeads } from "./remote.ts"

const KEY_NAME = "deploy_ed25519"
const TEST_TIMEOUT_MS = 20_000

export class KeyUnavailable extends Schema.TaggedError<KeyUnavailable>()("KeyUnavailable", {
  message: Schema.String
}) {}

export class ConnectionRefused extends Schema.TaggedError<ConnectionRefused>()("ConnectionRefused", {
  reason: ConnectionFailure,
  detail: Schema.String
}) {}

export interface DeployKey {
  readonly publicKey: string
  readonly fingerprint: string
  readonly path: string
}

const run = (command: string, args: ReadonlyArray<string>, env?: Record<string, string>) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      command,
      [...args],
      { timeout: TEST_TIMEOUT_MS, windowsHide: true, env: { ...process.env, ...env } },
      (error, stdout, stderr) => (error ? reject(new Error(`${stderr}\n${error.message}`)) : resolve(stdout))
    )
  })

const make = Effect.gen(function*() {
  const settings = yield* ServerConfig
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const deployKey = (label: string): Effect.Effect<DeployKey, KeyUnavailable> =>
    Effect.gen(function*() {
      if (settings.dataPath === undefined) return yield* new KeyUnavailable({ message: "Argus has no data folder to keep the key in" })
      const folder = path.join(settings.dataPath, "keys")
      const file = path.join(folder, KEY_NAME)
      yield* fileSystem.makeDirectory(folder, { recursive: true })
      if (!(yield* fileSystem.exists(file))) {
        yield* Effect.tryPromise(() => run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", label, "-f", file]))
      }
      const publicKey = (yield* fileSystem.readFileString(`${file}.pub`)).trim()
      const listing = yield* Effect.tryPromise(() => run("ssh-keygen", ["-l", "-f", `${file}.pub`]))
      return { publicKey, fingerprint: listing.split(" ")[1] ?? "", path: file }
    }).pipe(
      Effect.catch((cause) =>
        cause instanceof KeyUnavailable ? Effect.fail(cause) : Effect.fail(new KeyUnavailable({ message: String(cause) }))
      )
    )

  const test = (url: string, label = "argus-deploy"): Effect.Effect<ReadonlyArray<string>, ConnectionRefused | KeyUnavailable> =>
    Effect.gen(function*() {
      const key = yield* deployKey(label)
      const ssh = `ssh -i "${key.path.replaceAll("\\", "/")}" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new`
      const output = yield* Effect.tryPromise({
        try: () => run("git", ["ls-remote", "--heads", url], { GIT_SSH_COMMAND: ssh, GIT_TERMINAL_PROMPT: "0" }),
        catch: (cause) => {
          const detail = cause instanceof Error ? cause.message : String(cause)
          return new ConnectionRefused({ reason: classifyFailure(detail), detail: detail.trim().split("\n")[0] ?? "" })
        }
      })
      return parseRemoteHeads(output)
    })

  return GitConnection.of({ deployKey, test })
})

export class GitConnection extends Context.Service<GitConnection, {
  deployKey(label: string): Effect.Effect<DeployKey, KeyUnavailable>
  test(url: string, label?: string): Effect.Effect<ReadonlyArray<string>, ConnectionRefused | KeyUnavailable>
}>()("argus/agent/GitConnection") {
  static readonly layer = Layer.effect(GitConnection, make)
}
