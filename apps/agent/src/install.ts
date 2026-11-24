import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const RESOURCE_SOURCE = fileURLToPath(new URL("../resource/argus", import.meta.url))

export const EXECUTABLE_NAMES = process.platform === "win32" ? ["FXServer.exe"] : ["run.sh", "FXServer"]

const ENSURE_PATTERN = /^\s*(?:ensure|start)\s+argus\s*$/m
const HOSTNAME_PATTERN = /^\s*sv_hostname\s+"?([^"\n]+)"?\s*$/m
const COLOR_PATTERN = /\^\d/g

export type Check<A> = { ok: true; value: A } | { ok: false; message: string }

const isDirectory = (path: string) => existsSync(path) && statSync(path).isDirectory()

export const cleanPath = (input: string) => resolve(input.trim().replace(/^["']|["']$/g, ""))

export const checkDataFolder = (input: string, configFile = "server.cfg"): Check<string> => {
  if (!input.trim()) return { ok: false, message: "Type the folder path." }
  const folder = cleanPath(input)
  if (!isDirectory(folder)) return { ok: false, message: `${folder} does not exist.` }
  if (!existsSync(join(folder, configFile))) {
    return { ok: false, message: `No ${configFile} in ${folder}. Pick the folder that has ${configFile} and resources.` }
  }
  if (!isDirectory(join(folder, "resources"))) return { ok: false, message: `${folder} has ${configFile} but no resources folder.` }
  return { ok: true, value: folder }
}

export const checkExecutable = (input: string): Check<string> => {
  if (!input.trim()) return { ok: false, message: "Type the path to FXServer." }
  const path = cleanPath(input)
  if (isDirectory(path)) {
    const found = EXECUTABLE_NAMES.map((name) => join(path, name)).find((candidate) => existsSync(candidate))
    return found ? { ok: true, value: found } : { ok: false, message: `No ${EXECUTABLE_NAMES.join(" or ")} in ${path}.` }
  }
  if (!existsSync(path)) return { ok: false, message: `${path} does not exist.` }
  if (!EXECUTABLE_NAMES.includes(basename(path))) return { ok: false, message: `Point to ${EXECUTABLE_NAMES.join(" or ")}, not ${basename(path)}.` }
  return { ok: true, value: path }
}

export const guessExecutable = (dataFolder: string) => {
  const parent = dirname(dataFolder)
  const candidates = ["server", "artifacts", "fxserver", "FXServer", "."].flatMap((folder) =>
    EXECUTABLE_NAMES.map((name) => join(parent, folder, name))
  )
  return candidates.find((candidate) => existsSync(candidate))
}

export const guessName = (dataFolder: string, configFile = "server.cfg") => {
  const config = readFileSync(join(dataFolder, configFile), "utf8")
  const hostname = HOSTNAME_PATTERN.exec(config)?.[1]?.replace(COLOR_PATTERN, "").trim()
  const name = (hostname && hostname.length <= 32 ? hostname : basename(dataFolder)).replace(/\s+/g, "-").toLowerCase()
  return name.slice(0, 32) || "server"
}

export const installResource = (dataFolder: string) => {
  const target = join(dataFolder, "resources", "[argus]", "argus")
  const existed = existsSync(target)
  mkdirSync(target, { recursive: true })
  cpSync(RESOURCE_SOURCE, target, { recursive: true })
  return { path: target, updated: existed }
}

export const ensureInConfig = (dataFolder: string, configFile = "server.cfg") => {
  const file = join(dataFolder, configFile)
  const config = readFileSync(file, "utf8")
  if (ENSURE_PATTERN.test(config)) return { changed: false, backup: undefined }
  const backup = `${file}.before-argus`
  if (!existsSync(backup)) copyFileSync(file, backup)
  const separator = config.length === 0 || config.endsWith("\n") ? "" : "\n"
  writeFileSync(file, `${config}${separator}ensure argus\n`)
  return { changed: true, backup }
}

export const hasEnsure = (dataFolder: string, configFile = "server.cfg") => {
  const file = join(dataFolder, configFile)
  return existsSync(file) && ENSURE_PATTERN.test(readFileSync(file, "utf8"))
}
