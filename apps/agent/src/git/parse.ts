import { Schema } from "effect"

export const DriftState = Schema.Literals(["modified", "added", "deleted", "renamed", "untracked"])
export type DriftState = typeof DriftState.Type

export const DriftEntry = Schema.Struct({
  path: Schema.String,
  state: DriftState,
  resource: Schema.optionalKey(Schema.String)
})
export type DriftEntry = typeof DriftEntry.Type

export const Blame = Schema.Struct({
  commit: Schema.String,
  author: Schema.String,
  time: Schema.Number,
  summary: Schema.String,
  uncommitted: Schema.Boolean
})
export type Blame = typeof Blame.Type

const CATEGORY_FOLDER_PATTERN = /^\[.*\]$/
const UNCOMMITTED_PATTERN = /^0+$/
const BLAME_HEADER_PATTERN = /^([0-9a-f]{40}) \d+ \d+/

const stateOf = (index: string, worktree: string): DriftState => {
  if (index === "?" && worktree === "?") return "untracked"
  if (index === "R" || worktree === "R") return "renamed"
  if (index === "D" || worktree === "D") return "deleted"
  if (index === "A") return "added"
  return "modified"
}

export const resourceOfPath = (path: string): string | undefined => {
  const segments = path.split("/")
  const index = segments.findIndex((segment) => !CATEGORY_FOLDER_PATTERN.test(segment))
  return index >= 0 && index < segments.length - 1 ? segments[index] : undefined
}

export const parseStatus = (output: string): Array<DriftEntry> => {
  const records = output.split("\0")
  const entries: Array<DriftEntry> = []
  for (let index = 0; index < records.length; index++) {
    const record = records[index] ?? ""
    if (record.length < 4) continue
    const code = record.slice(0, 2)
    const path = record.slice(3)
    const state = stateOf(code[0] ?? " ", code[1] ?? " ")
    if (state === "renamed") index += 1
    const resource = resourceOfPath(path)
    entries.push({ path, state, ...(resource === undefined ? {} : { resource }) })
  }
  return entries
}

export const parseBlame = (output: string): Blame | undefined => {
  const lines = output.split("\n")
  const header = BLAME_HEADER_PATTERN.exec(lines[0] ?? "")
  if (header?.[1] === undefined) return undefined
  const field = (name: string) => lines.find((line) => line.startsWith(`${name} `))?.slice(name.length + 1) ?? ""
  const uncommitted = UNCOMMITTED_PATTERN.test(header[1])
  return {
    commit: uncommitted ? "" : header[1].slice(0, 7),
    author: uncommitted ? "" : field("author"),
    time: Number(field("author-time")) * 1000,
    summary: uncommitted ? "" : field("summary"),
    uncommitted
  }
}

export const Branch = Schema.Struct({
  name: Schema.String,
  commit: Schema.String,
  author: Schema.String,
  time: Schema.Number,
  summary: Schema.String,
  current: Schema.Boolean,
  remoteOnly: Schema.Boolean
})
export type Branch = typeof Branch.Type

export const BRANCH_FORMAT = "%(refname)%09%(objectname:short=7)%09%(authorname)%09%(committerdate:unix)%09%(subject)"

const LOCAL_PREFIX = "refs/heads/"
const REMOTE_PREFIX = "refs/remotes/origin/"

export const parseBranches = (output: string, current: string): Array<Branch> => {
  const branches = new Map<string, Branch>()
  for (const line of output.split("\n")) {
    const [ref = "", commit = "", author = "", time = "", ...subject] = line.split("\t")
    const local = ref.startsWith(LOCAL_PREFIX)
    if (!local && !ref.startsWith(REMOTE_PREFIX)) continue
    const name = ref.slice(local ? LOCAL_PREFIX.length : REMOTE_PREFIX.length)
    if (name === "HEAD" || (!local && branches.has(name))) continue
    branches.set(name, {
      name,
      commit,
      author,
      time: Number(time) * 1000,
      summary: subject.join("\t"),
      current: name === current,
      remoteOnly: !local
    })
  }
  return [...branches.values()].sort((first, second) => Number(second.current) - Number(first.current) || second.time - first.time)
}
