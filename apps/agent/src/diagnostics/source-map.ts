import { Schema } from "effect"

const BASE64_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const CONTINUATION_BIT = 32
const VALUE_MASK = 31
const MAX_ORIGINAL_LINES_PER_LINE = 3

export const SourceMap = Schema.Struct({
  sources: Schema.Array(Schema.NullOr(Schema.String)),
  mappings: Schema.String,
  sourceRoot: Schema.optionalKey(Schema.NullOr(Schema.String))
})
export type SourceMap = typeof SourceMap.Type

export const decodeSourceMap = Schema.decodeUnknownOption(Schema.fromJsonString(SourceMap))

export const decodeSegment = (segment: string): ReadonlyArray<number> => {
  const values: Array<number> = []
  let shift = 0
  let value = 0
  for (const character of segment) {
    const digit = BASE64_DIGITS.indexOf(character)
    if (digit < 0) return []
    value += (digit & VALUE_MASK) << shift
    if (digit & CONTINUATION_BIT) {
      shift += 5
      continue
    }
    values.push(value & 1 ? -(value >> 1) : value >> 1)
    shift = 0
    value = 0
  }
  return values
}

export interface OriginalPosition {
  readonly source: string
  readonly line: number
}

export const originalPosition = (map: SourceMap, generatedLine: number): OriginalPosition | undefined => {
  const lines = map.mappings.split(";")
  if (generatedLine < 1 || generatedLine > lines.length) return undefined
  let sourceIndex = 0
  let originalLine = 0
  const found: Array<{ readonly sourceIndex: number; readonly line: number }> = []

  for (let index = 0; index < generatedLine; index++) {
    const segments = lines[index] ?? ""
    if (segments.length === 0) continue
    for (const segment of segments.split(",")) {
      const fields = decodeSegment(segment)
      if (fields.length < 4) continue
      sourceIndex += fields[1] ?? 0
      originalLine += fields[2] ?? 0
      if (index === generatedLine - 1 && !found.some((entry) => entry.sourceIndex === sourceIndex && entry.line === originalLine)) {
        found.push({ sourceIndex, line: originalLine })
      }
    }
  }

  const first = found[0]
  if (first === undefined || found.length > MAX_ORIGINAL_LINES_PER_LINE) return undefined
  const source = map.sources[first.sourceIndex]
  if (source === null || source === undefined) return undefined
  return { source, line: first.line + 1 }
}
