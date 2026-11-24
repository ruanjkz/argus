import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { ServerConfig } from "../config.ts"
import type { CodeLocation, SourceLocation } from "./model.ts"
import { decodeSourceMap, originalPosition, type SourceMap } from "./source-map.ts"

const JAVASCRIPT_BUNDLE_PATTERN = /\.(?:js|mjs|cjs)$/i
const MANIFEST_FILES = ["fxmanifest.lua", "__resource.lua"]
const CATEGORY_FOLDER_PATTERN = /^\[.*\]$/
const MAX_CATEGORY_DEPTH = 6
const MAPPING_URL_MARKER = "//# sourceMappingURL="
const INLINE_MAP_PATTERN = /^data:application\/json[^,]*;base64,(.+)$/
const PROTOCOL_SOURCE_PATTERN = /^[a-z][\w+.-]*:\/\/[^/]*\/(.*)$/i

const make = Effect.gen(function*() {
  const settings = yield* ServerConfig
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const resourceFolders = new Map<string, Option.Option<string>>()

  const isResourceFolder = Effect.fnUntraced(function*(folder: string) {
    for (const manifest of MANIFEST_FILES) {
      if (yield* fileSystem.exists(path.join(folder, manifest))) return true
    }
    return false
  })

  const searchFolder: (folder: string, resource: string, depth: number) => Effect.Effect<Option.Option<string>> =
    Effect.fnUntraced(function*(folder: string, resource: string, depth: number) {
      const entries = yield* fileSystem.readDirectory(folder).pipe(Effect.orElseSucceed((): Array<string> => []))
      if (entries.includes(resource)) {
        const candidate = path.join(folder, resource)
        if (yield* isResourceFolder(candidate).pipe(Effect.orElseSucceed(() => false))) return Option.some(candidate)
      }
      if (depth >= MAX_CATEGORY_DEPTH) return Option.none<string>()
      for (const entry of entries) {
        if (!CATEGORY_FOLDER_PATTERN.test(entry)) continue
        const found = yield* searchFolder(path.join(folder, entry), resource, depth + 1)
        if (Option.isSome(found)) return found
      }
      return Option.none<string>()
    })

  const findResource = Effect.fnUntraced(function*(resource: string) {
    const known = resourceFolders.get(resource)
    if (known) return known
    const found = settings.resourcesPath === undefined
      ? Option.none<string>()
      : yield* searchFolder(settings.resourcesPath, resource, 0)
    resourceFolders.set(resource, found)
    return found
  })

  const readMap = Effect.fnUntraced(function*(bundle: string) {
    const sibling = `${bundle}.map`
    if (yield* fileSystem.exists(sibling)) {
      return Option.map(decodeSourceMap(yield* fileSystem.readFileString(sibling)), (map) => ({ map, file: sibling }))
    }
    const code = yield* fileSystem.readFileString(bundle)
    const marker = code.lastIndexOf(MAPPING_URL_MARKER)
    if (marker < 0) return Option.none<{ readonly map: SourceMap; readonly file: string }>()
    const reference = code.slice(marker + MAPPING_URL_MARKER.length).trim().split(/\s/)[0] ?? ""
    const inline = INLINE_MAP_PATTERN.exec(reference)
    if (inline?.[1] !== undefined) {
      const text = Buffer.from(inline[1], "base64").toString("utf8")
      return Option.map(decodeSourceMap(text), (map) => ({ map, file: bundle }))
    }
    const linked = path.resolve(path.dirname(bundle), reference)
    if (!(yield* fileSystem.exists(linked))) return Option.none<{ readonly map: SourceMap; readonly file: string }>()
    return Option.map(decodeSourceMap(yield* fileSystem.readFileString(linked)), (map) => ({ map, file: linked }))
  })

  const toResourcePath = (resourceFolder: string, mapFile: string, map: SourceMap, source: string) => {
    const bundled = PROTOCOL_SOURCE_PATTERN.exec(source)
    const absolute = bundled?.[1] !== undefined
      ? path.resolve(resourceFolder, bundled[1])
      : path.resolve(path.dirname(mapFile), map.sourceRoot ?? "", source)
    return path.relative(resourceFolder, absolute).replaceAll("\\", "/")
  }

  const resolve = (location: CodeLocation): Effect.Effect<Option.Option<SourceLocation>> =>
    Effect.gen(function*() {
      if (!JAVASCRIPT_BUNDLE_PATTERN.test(location.file)) return Option.none<SourceLocation>()
      const folder = yield* findResource(location.resource)
      if (Option.isNone(folder)) return Option.none<SourceLocation>()
      const loaded = yield* readMap(path.join(folder.value, location.file))
      if (Option.isNone(loaded)) return Option.none<SourceLocation>()
      const position = originalPosition(loaded.value.map, location.line)
      if (position === undefined) return Option.none<SourceLocation>()
      return Option.some({
        file: toResourcePath(folder.value, loaded.value.file, loaded.value.map, position.source),
        line: position.line
      })
    }).pipe(Effect.orElseSucceed(() => Option.none<SourceLocation>()))

  return SourceLocator.of({ resolve, folder: findResource })
})

export class SourceLocator extends Context.Service<SourceLocator, {
  resolve(location: CodeLocation): Effect.Effect<Option.Option<SourceLocation>>
  folder(resource: string): Effect.Effect<Option.Option<string>>
}>()("argus/agent/SourceLocator") {
  static readonly layer = Layer.effect(SourceLocator, make)
}
