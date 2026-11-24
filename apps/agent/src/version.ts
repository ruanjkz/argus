import manifest from "../package.json" with { type: "json" }

export const VERSION: string = manifest.version

const RELEASES_API = "https://api.github.com/repos/ruanjkz/argus/releases?per_page=10"
const CACHE_MS = 60 * 60_000

export interface ReleaseInfo {
  current: string
  latest: string | null
  newer: boolean
  url: string | null
  download: string | null
  notes: string | null
}

const parse = (value: string) => value.replace(/^v/, "").split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0)

export const isNewer = (candidate: string, current: string) => {
  const next = parse(candidate)
  const now = parse(current)
  for (let index = 0; index < Math.max(next.length, now.length, 3); index++) {
    const difference = (next[index] ?? 0) - (now[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

let cache: { at: number; info: ReleaseInfo } | undefined

export const latestRelease = async (): Promise<ReleaseInfo> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.info
  const fallback: ReleaseInfo = { current: VERSION, latest: null, newer: false, url: null, download: null, notes: null }
  try {
    const response = await fetch(RELEASES_API, {
      headers: { accept: "application/vnd.github+json", "user-agent": "argus-update-check" },
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) return fallback
    const releases = (await response.json()) as Array<{
      tag_name: string
      html_url: string
      draft: boolean
      body: string | null
      assets: Array<{ name: string; browser_download_url: string }>
    }>
    const release = releases.find((entry) => !entry.draft)
    if (!release) return fallback
    const asset = release.assets.find((entry) => entry.name === (process.platform === "win32" ? "Argus.exe" : "argus-linux.tar.gz"))
    const info: ReleaseInfo = {
      current: VERSION,
      latest: release.tag_name.replace(/^v/, ""),
      newer: isNewer(release.tag_name, VERSION),
      url: release.html_url,
      download: asset?.browser_download_url ?? null,
      notes: release.body ? release.body.slice(0, 2000) : null
    }
    cache = { at: Date.now(), info }
    return info
  } catch {
    return fallback
  }
}
