import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

import { resourceFiles } from "./assets.ts"

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
  for (const [file, data] of resourceFiles()) {
    const destination = join(target, file)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, data)
  }
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

const SKIPPED_FOLDERS = new Set([
  "windows",
  "program files",
  "program files (x86)",
  "programdata",
  "$recycle.bin",
  "system volume information",
  "appdata",
  "node_modules",
  ".git",
  "resources",
  "cache",
  "proc",
  "sys",
  "dev",
  "usr",
  "bin",
  "lib",
  "boot",
])

const SEARCH_DEPTH = 4
const SEARCH_FOLDER_LIMIT = 6000
const SEARCH_TIME_MS = 4000

export interface ServerCandidate {
  readonly dataFolder: string
  readonly name: string
  readonly executable: string | null
}

const searchRoots = (home: string) => {
  const personal = ["Desktop", "Documents", "Downloads", "OneDrive", "Área de Trabalho", "Documentos"].map((folder) => join(home, folder))
  if (process.platform !== "win32") return [home, ...personal, "/opt", "/srv", "/var/www", "/root"]
  const drives = "CDEFGH".split("").map((letter) => `${letter}:\\`)
  return [...personal, home, ...drives]
}

export const findServers = (home: string): Array<ServerCandidate> => {
  const started = Date.now()
  const seen = new Set<string>()
  const found = new Map<string, ServerCandidate>()
  let visited = 0
  const queue: Array<[string, number]> = searchRoots(home).filter((root) => existsSync(root)).map((root) => [root, 0])
  while (queue.length && visited < SEARCH_FOLDER_LIMIT && Date.now() - started < SEARCH_TIME_MS) {
    const [folder, depth] = queue.shift()!
    const key = folder.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    visited += 1
    let entries: Array<string>
    try {
      entries = readdirSync(folder)
    } catch {
      continue
    }
    if (entries.includes("server.cfg") && entries.includes("resources")) {
      const check = checkDataFolder(folder)
      if (check.ok && !found.has(key)) {
        found.set(key, { dataFolder: check.value, name: safeName(check.value), executable: guessExecutable(check.value) ?? null })
      }
      continue
    }
    if (depth >= SEARCH_DEPTH) continue
    for (const entry of entries) {
      if (entry.startsWith(".") || SKIPPED_FOLDERS.has(entry.toLowerCase())) continue
      const child = join(folder, entry)
      try {
        if (statSync(child).isDirectory()) queue.push([child, depth + 1])
      } catch {
        continue
      }
    }
  }
  return [...found.values()]
}

const safeName = (dataFolder: string) => {
  try {
    return guessName(dataFolder)
  } catch {
    return basename(dataFolder)
  }
}
