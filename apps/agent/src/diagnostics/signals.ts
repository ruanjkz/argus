import type { CodeLocation, Runtime } from "./model.ts"

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, "g")
const COLOR_CODE_PATTERN = /\^\d/g
const CHANNEL_PATTERN = /^\[\s*([^\]]+?)\s*\]\s?(.*)$/
const JAVASCRIPT_ERROR_PATTERN = /SCRIPT ERROR in (event `[^']*'|[^:]+): (.*)$/
const LUA_ERROR_PATTERN = /SCRIPT ERROR: (.*)$/
const LOAD_ERROR_PATTERN = /Error loading script \S+ in resource ([\w-]+): (.*)$/
const LOCATION_PATTERN = /@([\w-]+)\/([^:\s)]+):(\d+)/
const LEADING_LOCATION_PATTERN = /^@[\w-]+\/[^:\s]+:\d+:\s*/
const STACK_FRAME_PATTERN = /^>\s/
const HITCH_PATTERN = /(server|network|sync) thread hitch warning: timer interval of (\d+) milliseconds/
const RESOURCE_ERROR_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly resourceGroup: number }> = [
  { pattern: /Couldn't start resource ([\w-]+)/, resourceGroup: 1 },
  { pattern: /Could not find dependency [\w-]+ for resource ([\w-]+)/, resourceGroup: 1 },
  { pattern: /No such export \S+ in resource ([\w-]+)/, resourceGroup: 1 }
]
const JAVASCRIPT_FILE_PATTERN = /\.(?:js|mjs|cjs|ts)$/i
const LUA_FILE_PATTERN = /\.lua$/i

export type HitchThread = "server" | "network" | "sync"

export interface ScriptErrorSignal {
  readonly kind: "script-error"
  readonly resource: string | undefined
  readonly location: CodeLocation | undefined
  readonly message: string
  readonly runtime: Runtime | undefined
  readonly origin: string | undefined
}

export type Signal =
  | ScriptErrorSignal
  | { readonly kind: "resource-error"; readonly resource: string; readonly message: string }
  | { readonly kind: "hitch"; readonly thread: HitchThread; readonly milliseconds: number }
  | { readonly kind: "stack-frame"; readonly resource: string | undefined; readonly location: CodeLocation | undefined }

export const stripColors = (text: string): string => text.replace(ANSI_PATTERN, "").replace(COLOR_CODE_PATTERN, "")

export const parseLocation = (text: string): CodeLocation | undefined => {
  const match = LOCATION_PATTERN.exec(text)
  if (!match) return undefined
  const [, resource, file, line] = match
  if (resource === undefined || file === undefined || line === undefined) return undefined
  return { resource, file, line: Number(line) }
}

export const runtimeOf = (file: string | undefined): Runtime | undefined => {
  if (file === undefined) return undefined
  if (LUA_FILE_PATTERN.test(file)) return "lua"
  if (JAVASCRIPT_FILE_PATTERN.test(file)) return "javascript"
  return undefined
}

const splitChannel = (text: string): { readonly channel: string | undefined; readonly body: string } => {
  const match = CHANNEL_PATTERN.exec(text)
  if (!match) return { channel: undefined, body: text }
  return { channel: match[1], body: match[2] ?? "" }
}

const channelResource = (channel: string | undefined): string | undefined =>
  channel?.startsWith("script:") ? channel.slice("script:".length) : undefined

const scriptError = (
  detail: string,
  resource: string | undefined,
  runtime: Runtime | undefined,
  origin: string | undefined
): ScriptErrorSignal => {
  const location = parseLocation(detail)
  return {
    kind: "script-error",
    resource: location?.resource ?? resource,
    location,
    message: detail.replace(LEADING_LOCATION_PATTERN, "").trim(),
    runtime: runtimeOf(location?.file) ?? runtime,
    origin
  }
}

export const parseSignal = (raw: string): Signal | undefined => {
  const { channel, body } = splitChannel(stripColors(raw).trim())
  const resource = channelResource(channel)

  if (STACK_FRAME_PATTERN.test(body)) {
    return { kind: "stack-frame", resource, location: parseLocation(body) }
  }

  const hitch = HITCH_PATTERN.exec(body)
  if (hitch) {
    return { kind: "hitch", thread: hitch[1] as HitchThread, milliseconds: Number(hitch[2]) }
  }

  const loadError = LOAD_ERROR_PATTERN.exec(body)
  if (loadError) return scriptError(loadError[2] ?? "", loadError[1], undefined, "load")

  const javascriptError = JAVASCRIPT_ERROR_PATTERN.exec(body)
  if (javascriptError) return scriptError(javascriptError[2] ?? "", resource, "javascript", javascriptError[1])

  const luaError = LUA_ERROR_PATTERN.exec(body)
  if (luaError) return scriptError(luaError[1] ?? "", resource, undefined, undefined)

  for (const { pattern, resourceGroup } of RESOURCE_ERROR_PATTERNS) {
    const match = pattern.exec(body)
    const failed = match?.[resourceGroup]
    if (match && failed !== undefined) return { kind: "resource-error", resource: failed, message: body }
  }

  return undefined
}

export const normalizeMessage = (message: string): string =>
  message.replace(/0x[0-9a-f]+/gi, "#").replace(/\d+/g, "#").replace(/\s+/g, " ").trim()
