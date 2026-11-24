import { createRandom, PLAYERS } from "./mock"

export type IdentifierKind = "license" | "discord" | "steam" | "fivem" | "ip"

export type Identifier = { kind: IdentifierKind; value: string }

export type LinkReason = "same token" | "same discord" | "same ip"

export type LinkedAccount = { key: string; reasons: LinkReason[] }

export type HistoryType = "warn" | "kick" | "ban" | "unban" | "note"

export type HistoryEntry = {
  id: string
  type: HistoryType
  actor: string
  reason: string
  secondsAgo: number
  duration?: string
}

export type BanInfo = { reason: string; actor: string; duration: string; secondsAgo: number }

export type RosterPlayer = {
  key: string
  name: string
  serverId: number
  ping: number
  sessionMinutes: number
  playtimeMinutes: number
  sessions: number
  firstSeen: string
  lastSeenSeconds: number
  identifiers: Identifier[]
  tokens: number
  linked: LinkedAccount[]
  history: HistoryEntry[]
  ban?: BanInfo
}

const EXTRA_HANDLES = [
  "ghost",
  "pixel",
  "nox",
  "vibe",
  "rafa",
  "duda",
  "jota",
  "biel",
  "teco",
  "nina",
  "lua",
  "caio",
  "malu",
  "juju",
  "vini",
  "kayo",
  "sasa",
  "dg",
  "mk",
  "tz",
  "rk",
  "fz",
  "gb",
  "pv",
  "jp",
  "rn",
  "ty",
  "zl",
]

const SUFFIXES = ["", "_", ".gg", "7", "x", "99", "br", "zin"]

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"]

function hex(random: () => number, length: number) {
  let value = ""
  for (let index = 0; index < length; index++) value += Math.floor(random() * 16).toString(16)
  return value
}

function digits(random: () => number, length: number) {
  let value = String(1 + Math.floor(random() * 9))
  for (let index = 1; index < length; index++) value += Math.floor(random() * 10)
  return value
}

const DOC_RANGES = ["203.0.113", "198.51.100", "192.0.2"]

function buildRoster(): RosterPlayer[] {
  const random = createRandom(4242)
  const names = PLAYERS.map((player) => player.name)
  let cursor = 0
  while (names.length < 66) {
    const handle = EXTRA_HANDLES[cursor % EXTRA_HANDLES.length]
    const suffix = SUFFIXES[Math.floor(cursor / EXTRA_HANDLES.length) % SUFFIXES.length]
    const candidate = `${handle}${suffix}`
    if (!names.includes(candidate)) names.push(candidate)
    cursor += 1
  }
  names.push("kxng-alt", "gh0st_br", "rnx", "t0rnado")

  return names.map((name, index) => {
    const base = PLAYERS.find((player) => player.name === name)
    const ip = `${DOC_RANGES[index % DOC_RANGES.length]}.${10 + Math.floor(random() * 240)}`
    const identifiers: Identifier[] = [
      { kind: "license", value: `license:${hex(random, 40)}` },
      { kind: "discord", value: `discord:${digits(random, 18)}` },
    ]
    if (random() < 0.6) identifiers.push({ kind: "steam", value: `steam:11000010${hex(random, 7)}` })
    if (random() < 0.7) identifiers.push({ kind: "fivem", value: `fivem:${digits(random, 6)}` })
    identifiers.push({ kind: "ip", value: `ip:${ip}` })
    const playtimeMinutes = 120 + Math.floor(random() * 9000)
    return {
      key: identifiers[0].value.slice(8, 16),
      name,
      serverId: base?.id ?? 4 + index * 3,
      ping: base?.ping ?? 18 + Math.floor(random() * 70),
      sessionMinutes: base?.minutesOnline ?? 3 + Math.floor(random() * 160),
      playtimeMinutes,
      sessions: 4 + Math.floor(playtimeMinutes / (60 + random() * 120)),
      firstSeen: `${1 + Math.floor(random() * 27)} ${MONTHS[Math.floor(random() * MONTHS.length)]}`,
      lastSeenSeconds: 3600 + Math.floor(random() * 86400 * 9),
      identifiers,
      tokens: 3 + Math.floor(random() * 4),
      linked: [],
      history: [],
    }
  })
}

function byName(roster: RosterPlayer[], name: string) {
  const player = roster.find((entry) => entry.name === name)
  if (!player) throw new Error(`Missing roster player ${name}`)
  return player
}

function link(roster: RosterPlayer[], first: string, second: string, reasons: LinkReason[]) {
  const a = byName(roster, first)
  const b = byName(roster, second)
  a.linked.push({ key: b.key, reasons })
  b.linked.push({ key: a.key, reasons })
}

export const ROSTER: RosterPlayer[] = (() => {
  const roster = buildRoster()

  link(roster, "kxng", "kxng-alt", ["same token", "same ip"])
  link(roster, "tornado7", "t0rnado", ["same discord"])
  link(roster, "sereia", "lua_", ["same ip"])

  byName(roster, "kxng").history.push({
    id: "h-kxng-note",
    type: "note",
    actor: "admin",
    reason: "Main account of kxng-alt. Check new joins from the same token.",
    secondsAgo: 2260,
  })
  byName(roster, "kxng-alt").history.push({
    id: "h-alt-ban",
    type: "ban",
    actor: "admin",
    reason: "Ban evasion, alt of kxng",
    duration: "7 days",
    secondsAgo: 2280,
  })
  byName(roster, "kxng-alt").ban = { reason: "Ban evasion, alt of kxng", actor: "admin", duration: "7 days", secondsAgo: 2280 }
  byName(roster, "gh0st_br").history.push({
    id: "h-ghost-ban",
    type: "ban",
    actor: "argus",
    reason: "Headshot rate 3.4x above the server average for 6 rounds",
    duration: "Permanent",
    secondsAgo: 86400 * 4,
  })
  byName(roster, "gh0st_br").ban = {
    reason: "Headshot rate 3.4x above the server average for 6 rounds",
    actor: "argus",
    duration: "Permanent",
    secondsAgo: 86400 * 4,
  }
  byName(roster, "rnx").history.push({ id: "h-rnx-ban", type: "ban", actor: "lia.mod", reason: "Toxic chat after two warnings", duration: "30 days", secondsAgo: 86400 * 6 })
  byName(roster, "rnx").ban = { reason: "Toxic chat after two warnings", actor: "lia.mod", duration: "30 days", secondsAgo: 86400 * 6 }
  byName(roster, "tornado7").history.push(
    { id: "h-tor-1", type: "warn", actor: "lia.mod", reason: "Spawn camping", secondsAgo: 41100 },
    { id: "h-tor-2", type: "warn", actor: "admin", reason: "Team killing in ranked", secondsAgo: 86400 * 3 },
  )
  byName(roster, "dusk").history.push({ id: "h-dusk-kick", type: "kick", actor: "lia.mod", reason: "AFK", secondsAgo: 610 })
  byName(roster, "mrkz").history.push({
    id: "h-mrkz-ban",
    type: "ban",
    actor: "lia.mod",
    reason: "Exploiting a map glitch on Vinewood",
    duration: "1 day",
    secondsAgo: 86400 * 12,
  })
  byName(roster, "zeca").history.push(
    { id: "h-zeca-unban", type: "unban", actor: "admin", reason: "Appeal accepted, the clip showed a lag spike", secondsAgo: 86400 * 8 },
    { id: "h-zeca-ban", type: "ban", actor: "argus", reason: "Suspected aim assist in ranked", duration: "30 days", secondsAgo: 86400 * 9 },
  )
  byName(roster, "bruxo").history.push(
    { id: "h-bruxo-ban", type: "ban", actor: "admin", reason: "Toxic chat after a warning", duration: "7 days", secondsAgo: 86400 * 21 },
    { id: "h-bruxo-warn", type: "warn", actor: "admin", reason: "Toxic chat", secondsAgo: 86400 * 22 },
  )

  return roster
})()

export const ONLINE_ORDER: string[] = ROSTER.filter((player) => !player.ban && player.name !== "t0rnado").map((player) => player.key)

export function initials(name: string) {
  const letters = name.replace(/[^a-zA-Z0-9]/g, "")
  return (letters.slice(0, 2) || name.slice(0, 2)).toUpperCase()
}

export function shortIdentifier(value: string) {
  const [kind, raw] = value.split(":")
  if (kind === "ip") return value
  if (raw.length <= 12) return value
  return `${kind}:${raw.slice(0, 4)}…${raw.slice(-4)}`
}

export function formatPlaytime(minutes: number) {
  const hours = Math.floor(minutes / 60)
  if (hours >= 1) return `${hours.toLocaleString("en-US")}h ${minutes % 60}m`
  return `${minutes}m`
}
