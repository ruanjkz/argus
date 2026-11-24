import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

type SeaModule = { isSea(): boolean; getAsset(key: string): ArrayBuffer }

const loadSea = (): SeaModule | undefined => {
  try {
    const sea = process.getBuiltinModule?.("node:sea") as SeaModule | undefined
    return sea?.isSea() ? sea : undefined
  } catch {
    return undefined
  }
}

const sea = loadSea()

export const isPackaged = sea !== undefined

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const PANEL_FOLDER = isPackaged ? "" : here("../../panel/out")
const RESOURCE_FOLDER = isPackaged ? "" : here("../resource/argus")

export const FAKE_SERVER_SCRIPT = isPackaged ? "" : here("../fixtures/fake-fxserver.mjs")

export const FAKE_RESOURCES_FOLDER = isPackaged ? undefined : here("../fixtures/resources")

const walk = (root: string, folder = root, files = new Map<string, Buffer>()) => {
  for (const entry of readdirSync(folder)) {
    const path = join(folder, entry)
    if (statSync(path).isDirectory()) walk(root, path, files)
    else files.set(relative(root, path).replaceAll("\\", "/"), readFileSync(path))
  }
  return files
}

const fromBundle = (key: string) => {
  if (!sea) return new Map<string, Buffer>()
  const parsed = JSON.parse(Buffer.from(sea.getAsset(key)).toString("utf8")) as Record<string, string>
  return new Map(Object.entries(parsed).map(([path, data]) => [path, Buffer.from(data, "base64")]))
}

let panelFiles: Map<string, Buffer> | undefined

export const panelAvailable = () => isPackaged || existsSync(join(PANEL_FOLDER, "index.html"))

export const panelFile = (path: string): Buffer | undefined => {
  if (isPackaged) {
    panelFiles ??= fromBundle("panel.json")
    return panelFiles.get(path)
  }
  const full = join(PANEL_FOLDER, path)
  if (!full.startsWith(PANEL_FOLDER) || !existsSync(full) || !statSync(full).isFile()) return undefined
  return readFileSync(full)
}

export const resourceFiles = (): Map<string, Buffer> => (isPackaged ? fromBundle("resource.json") : walk(RESOURCE_FOLDER))
