import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

export interface ResourceEntry {
  name: string
  folder: string
  description: string
  version: string
  runtime: "lua" | "javascript"
  dependencies: Array<string>
  serverScripts: number
  clientScripts: number
}

const MANIFESTS = ["fxmanifest.lua", "__resource.lua"]
const CATEGORY = /^\[.*\]$/
const MAX_DEPTH = 6

const field = (manifest: string, name: string) => new RegExp(`^\\s*${name}\\s*[ (]?\\s*['"]([^'"]*)['"]`, "m").exec(manifest)?.[1] ?? ""

const listValues = (manifest: string, names: ReadonlyArray<string>) => {
  const values: Array<string> = []
  for (const name of names) {
    const single = new RegExp(`^\\s*${name}\\s*[ (]?\\s*['"]([^'"]+)['"]`, "gm")
    for (const match of manifest.matchAll(single)) if (match[1]) values.push(match[1])
    const block = new RegExp(`^\\s*${name}\\s*\\{([^}]*)\\}`, "gm")
    for (const match of manifest.matchAll(block)) {
      for (const item of (match[1] ?? "").matchAll(/['"]([^'"]+)['"]/g)) if (item[1]) values.push(item[1])
    }
  }
  return values
}

const describe = (path: string, name: string, folder: string): ResourceEntry | undefined => {
  const manifestFile = MANIFESTS.map((file) => join(path, file)).find((file) => existsSync(file))
  if (!manifestFile) return undefined
  let manifest = ""
  try {
    manifest = readFileSync(manifestFile, "utf8")
  } catch {
    return undefined
  }
  const serverScripts = listValues(manifest, ["server_script", "server_scripts"])
  const clientScripts = listValues(manifest, ["client_script", "client_scripts"])
  const shared = listValues(manifest, ["shared_script", "shared_scripts"])
  const scripts = [...serverScripts, ...clientScripts, ...shared]
  return {
    name,
    folder,
    description: field(manifest, "description"),
    version: field(manifest, "version"),
    runtime: scripts.some((script) => /\.(js|mjs|cjs)$/i.test(script)) && !scripts.some((script) => /\.lua$/i.test(script)) ? "javascript" : "lua",
    dependencies: listValues(manifest, ["dependency", "dependencies"]).filter((dependency) => !dependency.startsWith("/")),
    serverScripts: serverScripts.length,
    clientScripts: clientScripts.length
  }
}

export const scanResources = (root: string | undefined): Array<ResourceEntry> => {
  if (!root || !existsSync(root)) return []
  const found: Array<ResourceEntry> = []
  const walk = (folder: string, category: string, depth: number) => {
    let entries: Array<string> = []
    try {
      entries = readdirSync(folder)
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(folder, entry)
      try {
        if (!statSync(path).isDirectory()) continue
      } catch {
        continue
      }
      if (CATEGORY.test(entry)) {
        if (depth < MAX_DEPTH) walk(path, category ? `${category}/${entry}` : entry, depth + 1)
        continue
      }
      const resource = describe(path, entry, category)
      if (resource) found.push(resource)
    }
  }
  walk(root, "", 0)
  return found.sort((first, second) => first.folder.localeCompare(second.folder) || first.name.localeCompare(second.name))
}
