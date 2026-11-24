import { homedir } from "node:os"

import { createArgusFile, defaultSettings, readArgusFile, writeArgusFile, type ArgusFile } from "../home.ts"
import {
  checkDataFolder,
  checkExecutable,
  ensureInConfig,
  EXECUTABLE_NAMES,
  findServers,
  guessExecutable,
  guessName,
  hasEnsure,
  installResource,
  type ServerCandidate
} from "../install.ts"
import { HttpError, readBody, send, type Handler } from "./host.ts"

const text = (value: unknown) => (typeof value === "string" ? value : "")

export const makeSetupHandler = (home: string, onInstalled: (file: ArgusFile) => void): Handler => {
  let candidates: Array<ServerCandidate> | undefined
  let installed = false

  return async (request, response, route) => {
    switch (route) {
      case "GET /state":
        send(response, 409, { error: "Argus is not set up yet", setup: true })
        return true
      case "GET /setup":
        candidates ??= findServers(homedir())
        send(response, 200, {
          configured: false,
          platform: process.platform,
          executableName: EXECUTABLE_NAMES[0],
          candidates
        })
        return true
      case "POST /setup/check": {
        const body = await readBody(request)
        const data = checkDataFolder(text(body.dataFolder))
        if (!data.ok) {
          send(response, 200, { dataFolder: data, executable: null, name: null, willEnsure: false })
          return true
        }
        const executableInput = text(body.executable)
        const guess = guessExecutable(data.value)
        const executable = executableInput.trim()
          ? checkExecutable(executableInput)
          : guess
          ? checkExecutable(guess)
          : { ok: false as const, message: `Argus did not find ${EXECUTABLE_NAMES[0]} next to this folder. Paste its path.` }
        send(response, 200, {
          dataFolder: data,
          executable,
          name: guessName(data.value),
          willEnsure: !hasEnsure(data.value)
        })
        return true
      }
      case "POST /setup/install": {
        if (installed) throw new HttpError(409, "Argus is already set up")
        const body = await readBody(request)
        const data = checkDataFolder(text(body.dataFolder))
        if (!data.ok) throw new HttpError(400, data.message)
        const executable = checkExecutable(text(body.executable))
        if (!executable.ok) throw new HttpError(400, executable.message)
        const name = text(body.name).trim().slice(0, 32) || guessName(data.value)
        installResource(data.value)
        ensureInConfig(data.value)
        const existing = readArgusFile(home)
        const settings = {
          ...(existing?.settings ?? defaultSettings(executable.value, data.value, name)),
          name,
          executable: executable.value,
          dataFolder: data.value,
          autoStart: body.autoStart !== false
        }
        const file = existing ? { ...existing, settings } : createArgusFile(settings)
        writeArgusFile(file, home)
        installed = true
        send(response, 200, { ok: true })
        setTimeout(() => onInstalled(file), 50)
        return true
      }
      default:
        return false
    }
  }
}
