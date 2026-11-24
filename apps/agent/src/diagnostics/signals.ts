import type { CodeLocation } from "./model.ts"

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, "g")
const CHANNEL_PATTERN = /^\[\s*([^\]]+?)\s*\]\s?(.*)$/
const SCRIPT_ERROR_PATTERN = /SCRIPT ERROR(?: in [^:]+)?: (.*)$/
const LOAD_ERROR_PATTERN = /Error loading script \S+ in resource ([\w-]+): (.*)$/
const LOCATION_PATTERN = /@([\w-]+)\/([^:\s]+):(\d+)/
const LEADING_LOCATION_PATTERN = /^@[\w-]+\/[^:\s]+:\d+:\s*/
const HITCH_PATTERN = /(server|network|sync) thread hitch warning: timer interval of (\d+) milliseconds/
const RESOURCE_ERROR_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly resourceGroup: number }> = [
  { pattern: /Couldn't start resource ([\w-]+)/, resourceGroup: 1 },
  { pattern: /Could not find dependency [\w-]+ for resource ([\w-]+)/, resourceGroup: 1 },
  { pattern: /No such export \S+ in resource ([\w-]+)/, resourceGroup: 1 }
]

export type HitchThread = "server" | "network" | "sync"

export type Signal =
  | {
    readonly kind: "script-error"
    readonly resource: string | undefined
    readonly location: CodeLocation | undefined
    readonly message: string
  }
  | { readonly kind: "resource-error"; readonly resource: string; readonly message: string }
  | { readonly kind: "hitch"; readonly thread: HitchThread; readonly milliseconds: number }

export const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, "")

export const parseLocation = (text: string): CodeLocation | undefined => {
  const match = LOCATION_PATTERN.exec(text)
  if (!match) return undefined
  const [, resource, file, line] = match
  if (resource === undefined || file === undefined || line === undefined) return undefined
  return { resource, file, line: Number(line) }
}

const splitChannel = (text: string): { readonly channel: string | undefined; readonly body: string } => {
  const match = CHANNEL_PATTERN.exec(text)
  if (!match) return { channel: undefined, body: text }
  return { channel: match[1], body: match[2] ?? "" }
}

const channelResource = (channel: string | undefined): string | undefined =>
  channel?.startsWith("script:") ? channel.slice("script:".length) : undefined

export const parseSignal = (raw: string): Signal | undefined => {
  const { channel, body } = splitChannel(stripAnsi(raw).trim())

  const hitch = HITCH_PATTERN.exec(body)
  if (hitch) {
    return { kind: "hitch", thread: hitch[1] as HitchThread, milliseconds: Number(hitch[2]) }
  }

  const loadError = LOAD_ERROR_PATTERN.exec(body)
  if (loadError) {
    const detail = loadError[2] ?? ""
    return {
      kind: "script-error",
      resource: loadError[1],
      location: parseLocation(detail),
      message: detail.replace(LEADING_LOCATION_PATTERN, "")
    }
  }

  const scriptError = SCRIPT_ERROR_PATTERN.exec(body)
  if (scriptError) {
    const detail = scriptError[1] ?? ""
    const location = parseLocation(detail)
    return {
      kind: "script-error",
      resource: location?.resource ?? channelResource(channel),
      location,
      message: detail.replace(LEADING_LOCATION_PATTERN, "")
    }
  }

  for (const { pattern, resourceGroup } of RESOURCE_ERROR_PATTERNS) {
    const match = pattern.exec(body)
    const resource = match?.[resourceGroup]
    if (match && resource !== undefined) return { kind: "resource-error", resource, message: body }
  }

  return undefined
}

export const normalizeMessage = (message: string): string =>
  message.replace(/0x[0-9a-f]+/gi, "#").replace(/\d+/g, "#").replace(/\s+/g, " ").trim()
