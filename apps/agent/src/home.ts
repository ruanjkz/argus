import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"

import { Duration } from "effect"

import type { ServerSettings } from "./config.ts"

export interface PanelSettings {
  name: string
  executable: string
  dataFolder: string
  configFile: string
  launchArgs: string
  autoStart: boolean
  startup: Array<string>
  restartTimes: Array<string>
  restartWarnings: Array<number>
  restartOnCrash: boolean
  maxFailedStarts: number
  heartbeatTimeoutSeconds: number
  bootTimeoutSeconds: number
  stopTimeoutSeconds: number
  defaultBanDuration: string
  banMessage: string
}

export interface RepositoryLink {
  url: string
  branch: string
}

export interface ArgusFile {
  version: 1
  token: string
  agentPort: number
  panelPort: number
  settings: PanelSettings
  repository: RepositoryLink | null
  remote: boolean
}

export const DEFAULT_AGENT_PORT = 3201
export const DEFAULT_PANEL_PORT = 3200

export const argusHome = () => process.env.ARGUS_HOME ?? join(homedir(), ".argus")

export const argusFilePath = (home = argusHome()) => join(home, "argus.json")

export const defaultSettings = (executable: string, dataFolder: string, name: string): PanelSettings => ({
  name,
  executable,
  dataFolder,
  configFile: "server.cfg",
  launchArgs: "",
  autoStart: true,
  startup: [],
  restartTimes: [],
  restartWarnings: [10, 5, 1],
  restartOnCrash: true,
  maxFailedStarts: 5,
  heartbeatTimeoutSeconds: 60,
  bootTimeoutSeconds: 120,
  stopTimeoutSeconds: 15,
  defaultBanDuration: "7 days",
  banMessage: "You are banned from this server. Reason: {reason}. Expires: {expires}. Ban id: {id}."
})

export const newToken = () => randomBytes(24).toString("base64url")

export const createArgusFile = (settings: PanelSettings): ArgusFile => ({
  version: 1,
  token: newToken(),
  agentPort: DEFAULT_AGENT_PORT,
  panelPort: DEFAULT_PANEL_PORT,
  settings,
  repository: null,
  remote: false
})

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

export const readArgusFile = (home = argusHome()): ArgusFile | undefined => {
  const file = argusFilePath(home)
  if (!existsSync(file)) return undefined
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
  if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.token !== "string" || !isRecord(parsed.settings)) {
    throw new Error(`${file} is not an Argus config file`)
  }
  const fallback = defaultSettings("", "", "server")
  return {
    version: 1,
    token: parsed.token,
    agentPort: typeof parsed.agentPort === "number" ? parsed.agentPort : DEFAULT_AGENT_PORT,
    panelPort: typeof parsed.panelPort === "number" ? parsed.panelPort : DEFAULT_PANEL_PORT,
    settings: { ...fallback, ...(parsed.settings as Partial<PanelSettings>) },
    remote: parsed.remote === true,
    repository: isRecord(parsed.repository) && typeof parsed.repository.url === "string" && typeof parsed.repository.branch === "string"
      ? { url: parsed.repository.url, branch: parsed.repository.branch }
      : null
  }
}

export const writeArgusFile = (file: ArgusFile, home = argusHome()) => {
  mkdirSync(home, { recursive: true })
  const target = argusFilePath(home)
  const temporary = join(dirname(target), `.${basename(target)}.tmp`)
  writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, target)
  try {
    chmodSync(target, 0o600)
  } catch {
    return
  }
}

export const splitArgs = (value: string) => value.match(/"[^"]*"|\S+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? []

export const toServerSettings = (settings: PanelSettings, home = argusHome()): Partial<ServerSettings> & Pick<ServerSettings, "executable"> => ({
  executable: settings.executable,
  args: ["+exec", settings.configFile, ...splitArgs(settings.launchArgs)],
  cwd: settings.dataFolder,
  resourcesPath: join(settings.dataFolder, "resources"),
  dataPath: home,
  bootTimeout: Duration.seconds(settings.bootTimeoutSeconds),
  heartbeatTimeout: Duration.seconds(settings.heartbeatTimeoutSeconds),
  stopTimeout: Duration.seconds(settings.stopTimeoutSeconds),
  maxConsecutiveFailures: settings.restartOnCrash ? settings.maxFailedStarts : 1
})
