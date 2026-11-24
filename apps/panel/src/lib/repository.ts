export type Remote = { host: string; owner: string; name: string; sshUrl: string; webUrl: string; deployKeysUrl?: string }

export type ConnectionFailure = "key-not-added" | "repository-not-found" | "host-unreachable" | "timed-out" | "unknown"

const SEGMENT = "[A-Za-z0-9._-]+"
const SCP_PATTERN = new RegExp(`^(?:ssh://)?git@([A-Za-z0-9.-]+)[:/](${SEGMENT})/(${SEGMENT}?)(?:\\.git)?/?$`)
const HTTPS_PATTERN = new RegExp(`^https?://(?:[^@/]+@)?([A-Za-z0-9.-]+)/(${SEGMENT})/(${SEGMENT}?)(?:\\.git)?(?:/.*)?$`)
const SHORT_PATTERN = new RegExp(`^(${SEGMENT})/(${SEGMENT}?)(?:\\.git)?$`)

const DEPLOY_KEY_PATHS: Record<string, string> = { "github.com": "settings/keys/new", "gitlab.com": "-/settings/repository" }

const HOST_NAMES: Record<string, string> = { "github.com": "GitHub", "gitlab.com": "GitLab" }

function build(host: string, owner: string, name: string): Remote {
  const webUrl = `https://${host}/${owner}/${name}`
  const keysPath = DEPLOY_KEY_PATHS[host]
  return { host, owner, name, sshUrl: `git@${host}:${owner}/${name}.git`, webUrl, deployKeysUrl: keysPath ? `${webUrl}/${keysPath}` : undefined }
}

export function parseRemote(input: string): Remote | null {
  const value = input.trim()
  const full = SCP_PATTERN.exec(value) ?? HTTPS_PATTERN.exec(value)
  if (full && full[3]) return build(full[1].toLowerCase(), full[2], full[3])
  const short = SHORT_PATTERN.exec(value)
  if (short && short[2]) return build("github.com", short[1], short[2])
  return null
}

export function hostName(remote: Remote) {
  return HOST_NAMES[remote.host] ?? remote.host
}

export const DEPLOY_PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIArgusDemoKeyNotARealOne0000000000000000000000 argus-arena-01"

export const DEPLOY_KEY_FINGERPRINT = "SHA256:argusDemoFingerprintNotReal0000000000000000"

export const FAILURE_COPY: Record<ConnectionFailure, { title: string; fix: string }> = {
  "key-not-added": {
    title: "The repository refused the key",
    fix: "The key is not on the repository yet. Go back one step, copy it and add it as a deploy key, then test again.",
  },
  "repository-not-found": {
    title: "No repository at that address",
    fix: "Check the owner and the name. If the repository is private and the key was added to another one, it also looks like this.",
  },
  "host-unreachable": {
    title: "This machine could not reach the host",
    fix: "Check the internet connection and that outgoing SSH on port 22 is allowed by the firewall.",
  },
  "timed-out": { title: "The host took too long to answer", fix: "Try again in a moment. If it keeps happening, check the firewall." },
  unknown: { title: "The test failed", fix: "Try again. The console has the full git output." },
}
