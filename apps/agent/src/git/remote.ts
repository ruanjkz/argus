import { Schema } from "effect"

export const Remote = Schema.Struct({
  host: Schema.String,
  owner: Schema.String,
  name: Schema.String,
  sshUrl: Schema.String,
  webUrl: Schema.String,
  deployKeysUrl: Schema.optionalKey(Schema.String)
})
export type Remote = typeof Remote.Type

export const ConnectionFailure = Schema.Literals([
  "key-not-added",
  "repository-not-found",
  "host-unreachable",
  "ssh-missing",
  "timed-out",
  "unknown"
])
export type ConnectionFailure = typeof ConnectionFailure.Type

const SEGMENT = "[A-Za-z0-9._-]+"
const SCP_PATTERN = new RegExp(`^(?:ssh://)?git@([A-Za-z0-9.-]+)[:/](${SEGMENT})/(${SEGMENT}?)(?:\\.git)?/?$`)
const HTTPS_PATTERN = new RegExp(`^https?://(?:[^@/]+@)?([A-Za-z0-9.-]+)/(${SEGMENT})/(${SEGMENT}?)(?:\\.git)?(?:/.*)?$`)
const SHORT_PATTERN = new RegExp(`^(${SEGMENT})/(${SEGMENT}?)(?:\\.git)?$`)

const DEPLOY_KEY_PATHS: Record<string, string> = {
  "github.com": "settings/keys/new",
  "gitlab.com": "-/settings/repository"
}

const build = (host: string, owner: string, name: string): Remote => {
  const webUrl = `https://${host}/${owner}/${name}`
  const keysPath = DEPLOY_KEY_PATHS[host]
  return {
    host,
    owner,
    name,
    sshUrl: `git@${host}:${owner}/${name}.git`,
    webUrl,
    ...(keysPath === undefined ? {} : { deployKeysUrl: `${webUrl}/${keysPath}` })
  }
}

export const parseRemote = (input: string): Remote | undefined => {
  const value = input.trim()
  const full = SCP_PATTERN.exec(value) ?? HTTPS_PATTERN.exec(value)
  if (full?.[1] !== undefined && full[2] !== undefined && full[3]) return build(full[1].toLowerCase(), full[2], full[3])
  const short = SHORT_PATTERN.exec(value)
  if (short?.[1] !== undefined && short[2]) return build("github.com", short[1], short[2])
  return undefined
}

export const classifyFailure = (output: string): ConnectionFailure => {
  const text = output.toLowerCase()
  if (text.includes("permission denied")) return "key-not-added"
  if (text.includes("repository not found") || text.includes("does not appear to be a git repository")) return "repository-not-found"
  if (text.includes("could not resolve hostname") || text.includes("network is unreachable") || text.includes("connection refused")) {
    return "host-unreachable"
  }
  if (text.includes("timed out")) return "timed-out"
  if (text.includes("enoent") || text.includes("not recognized") || text.includes("command not found")) return "ssh-missing"
  return "unknown"
}

export const parseRemoteHeads = (output: string): Array<string> =>
  output
    .split("\n")
    .map((line) => line.split("\t")[1] ?? "")
    .filter((ref) => ref.startsWith("refs/heads/"))
    .map((ref) => ref.slice("refs/heads/".length))
