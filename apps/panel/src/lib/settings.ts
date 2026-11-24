import { BAN_DURATIONS } from "./bans"
import { RESOURCE_CATALOG } from "./resources"

export type Settings = {
  name: string
  executable: string
  dataFolder: string
  configFile: string
  launchArgs: string
  autoStart: boolean
  startup: string[]
  restartTimes: string[]
  restartWarnings: number[]
  restartOnCrash: boolean
  maxFailedStarts: number
  heartbeatTimeoutSeconds: number
  bootTimeoutSeconds: number
  stopTimeoutSeconds: number
  defaultBanDuration: string
  banMessage: string
}

export type SettingKey = keyof Settings

export type NumericKey = "maxFailedStarts" | "heartbeatTimeoutSeconds" | "bootTimeoutSeconds" | "stopTimeoutSeconds"

export type SettingsDraft = Omit<Settings, NumericKey> & Record<NumericKey, string>

export type SectionId = "server" | "startup" | "restarts" | "watchdog" | "bans"

export type SettingErrors = Partial<Record<SettingKey, string>>

export const SECTIONS: { id: SectionId; label: string; description: string; keys: SettingKey[] }[] = [
  {
    id: "server",
    label: "Server",
    description: "Where FXServer lives and how Argus launches it.",
    keys: ["name", "executable", "dataFolder", "configFile", "launchArgs", "autoStart"],
  },
  {
    id: "startup",
    label: "Startup",
    description: "What gets ensured, and in which order, every time the server starts.",
    keys: ["startup"],
  },
  {
    id: "restarts",
    label: "Restarts",
    description: "Daily restarts and the warnings players see before one.",
    keys: ["restartTimes", "restartWarnings"],
  },
  {
    id: "watchdog",
    label: "Watchdog",
    description: "How Argus decides the server crashed or hung, and what it does next.",
    keys: ["restartOnCrash", "maxFailedStarts", "heartbeatTimeoutSeconds", "bootTimeoutSeconds", "stopTimeoutSeconds"],
  },
  {
    id: "bans",
    label: "Bans",
    description: "Defaults for new bans and what a banned player reads.",
    keys: ["defaultBanDuration", "banMessage"],
  },
]

export const NEXT_START_KEYS: SettingKey[] = ["executable", "dataFolder", "configFile", "launchArgs", "startup"]

export const NUMERIC_LIMITS: Record<NumericKey, { min: number; max: number }> = {
  maxFailedStarts: { min: 1, max: 20 },
  heartbeatTimeoutSeconds: { min: 15, max: 600 },
  bootTimeoutSeconds: { min: 30, max: 900 },
  stopTimeoutSeconds: { min: 5, max: 120 },
}

export const WARNING_MINUTES = [30, 15, 10, 5, 1]

export const MAX_RESTART_TIMES = 6

export const BAN_MESSAGE_TOKENS = ["{reason}", "{expires}", "{id}"]

export const DEFAULT_SETTINGS: Settings = {
  name: "arena-01",
  executable: "C:\\FXServer\\artifacts\\19253\\FXServer.exe",
  dataFolder: "C:\\FXServer\\server-data",
  configFile: "server.cfg",
  launchArgs: "+set onesync on +set sv_enforceGameBuild 3258",
  autoStart: true,
  startup: ["[system]", "[arena]", "[gameplay]", "[integrations]", "maps_vinewood", "weapons_meta", "vehicles_meta"],
  restartTimes: ["04:00"],
  restartWarnings: [10, 5, 1],
  restartOnCrash: true,
  maxFailedStarts: 5,
  heartbeatTimeoutSeconds: 60,
  bootTimeoutSeconds: 120,
  stopTimeoutSeconds: 15,
  defaultBanDuration: "7 days",
  banMessage: "You are banned from this server. Reason: {reason}. Expires: {expires}. Ban id: {id}.",
}

const NUMERIC_KEYS = Object.keys(NUMERIC_LIMITS) as NumericKey[]

const EXECUTABLE_NAMES = ["fxserver.exe", "fxserver", "run.sh"]

export function toDraft(settings: Settings): SettingsDraft {
  return {
    ...settings,
    maxFailedStarts: String(settings.maxFailedStarts),
    heartbeatTimeoutSeconds: String(settings.heartbeatTimeoutSeconds),
    bootTimeoutSeconds: String(settings.bootTimeoutSeconds),
    stopTimeoutSeconds: String(settings.stopTimeoutSeconds),
  }
}

export function fromDraft(draft: SettingsDraft): Settings {
  return {
    ...draft,
    name: draft.name.trim(),
    executable: draft.executable.trim(),
    dataFolder: draft.dataFolder.trim(),
    configFile: draft.configFile.trim(),
    launchArgs: draft.launchArgs.trim(),
    banMessage: draft.banMessage.trim(),
    maxFailedStarts: Number(draft.maxFailedStarts),
    heartbeatTimeoutSeconds: Number(draft.heartbeatTimeoutSeconds),
    bootTimeoutSeconds: Number(draft.bootTimeoutSeconds),
    stopTimeoutSeconds: Number(draft.stopTimeoutSeconds),
  }
}

export function changedKeys(draft: SettingsDraft, saved: SettingsDraft): SettingKey[] {
  return (Object.keys(draft) as SettingKey[]).filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]))
}

function fileName(path: string) {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1)
}

export function validateSettings(draft: SettingsDraft): SettingErrors {
  const errors: SettingErrors = {}
  const name = draft.name.trim()
  if (!name) errors.name = "Give the server a name."
  else if (name.length > 32) errors.name = "Keep the name under 33 characters."

  const executable = draft.executable.trim()
  if (!executable) errors.executable = "Point this at FXServer.exe or run.sh."
  else if (!EXECUTABLE_NAMES.includes(fileName(executable).toLowerCase())) errors.executable = "The path has to end in FXServer.exe or run.sh."

  if (!draft.dataFolder.trim()) errors.dataFolder = "Point this at the folder with server.cfg."

  const configFile = draft.configFile.trim()
  if (!configFile) errors.configFile = "Name the config file, like server.cfg."
  else if (!configFile.toLowerCase().endsWith(".cfg")) errors.configFile = "The config file has to end in .cfg."

  for (const key of NUMERIC_KEYS) {
    const { min, max } = NUMERIC_LIMITS[key]
    const value = draft[key].trim()
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) errors[key] = `Use a whole number from ${min} to ${max}.`
  }

  if (!BAN_DURATIONS.includes(draft.defaultBanDuration)) errors.defaultBanDuration = "Pick one of the ban lengths."

  const banMessage = draft.banMessage.trim()
  if (!banMessage) errors.banMessage = "Write what a banned player reads."
  else if (banMessage.length > 240) errors.banMessage = "Keep the message under 241 characters."

  return errors
}

export const RESOURCE_FOLDERS = [...new Set(RESOURCE_CATALOG.map((entry) => entry.folder))]

const CATALOG_BY_NAME = new Map(RESOURCE_CATALOG.map((entry) => [entry.name, entry]))

export function isFolderEntry(entry: string) {
  return /^\[[^\]]+\]$/.test(entry)
}

export function folderMembers(folder: string) {
  return RESOURCE_CATALOG.filter((entry) => entry.folder === folder).map((entry) => entry.name)
}

export function startupCoverage(startup: string[]) {
  const covered = new Set<string>()
  for (const entry of startup) {
    if (isFolderEntry(entry)) folderMembers(entry).forEach((name) => covered.add(name))
    else if (CATALOG_BY_NAME.has(entry)) covered.add(entry)
  }
  return covered
}

export function startupEntryError(value: string, startup: string[]) {
  if (!value) return "Type a [folder] or a resource name."
  if (startup.includes(value)) return `${value} is already in the list.`
  if (isFolderEntry(value)) return RESOURCE_FOLDERS.includes(value) ? null : `No folder ${value} in the resources folder.`
  const resource = CATALOG_BY_NAME.get(value)
  if (!resource) return `No resource named ${value}. Folders go in brackets, like [gameplay].`
  if (startup.includes(resource.folder)) return `${value} already starts with ${resource.folder}.`
  return null
}

export function addStartupEntry(startup: string[], value: string) {
  if (!isFolderEntry(value)) return [...startup, value]
  const members = new Set(folderMembers(value))
  return [...startup.filter((entry) => !members.has(entry)), value]
}

export function normalizeTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, "0")}:${match[2]}`
}

export function nextRestartTime(times: string[], nowSeconds: number) {
  if (times.length === 0) return null
  const sorted = [...times].sort()
  const seconds = (time: string) => Number(time.slice(0, 2)) * 3600 + Number(time.slice(3)) * 60
  return sorted.find((time) => seconds(time) > nowSeconds % 86400) ?? sorted[0]
}

export function renderBanMessage(template: string, values: { reason: string; expires: string; id: string }) {
  return template.replaceAll("{reason}", values.reason).replaceAll("{expires}", values.expires).replaceAll("{id}", values.id)
}
