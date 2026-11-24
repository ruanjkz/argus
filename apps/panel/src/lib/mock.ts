import { t } from "./i18n"
import { RESOURCE_CATALOG } from "./resources"

export function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export type Resource = { name: string; state: "started" | "stopped" }

export const RESOURCES: Resource[] = RESOURCE_CATALOG.map((entry) => ({
  name: entry.name,
  state: entry.initial === "started" ? "started" : "stopped",
}))

export type Player = { id: number; name: string; ping: number; minutesOnline: number }

const PLAYER_NAMES = [
  "kxng",
  "vlt.ana",
  "mrkz",
  "dusk",
  "neblina",
  "tornado7",
  "lia.mod",
  "zeca",
  "r4ven",
  "bruxo",
  "kaio_",
  "sereia",
]

export const PLAYERS: Player[] = (() => {
  const random = createRandom(42)
  return PLAYER_NAMES.map((name, index) => ({
    id: 3 + index * 7,
    name,
    ping: 18 + Math.round(random() * 60),
    minutesOnline: 4 + Math.round(random() * 180),
  }))
})()

export type IncidentKind = "error" | "hang" | "warn"

export type IncidentExplanation = {
  title: string
  what: string
  impact: string
  fix: string
}

export type IncidentOrigin = { commit: string; author: string; summary: string; uncommitted: boolean }

export type Incident = {
  id: string
  kind: IncidentKind
  resource: string
  location: string
  message: string
  count: number
  lastSeen: number
  firstSeen: string
  explanation: IncidentExplanation
  introducedBy?: IncidentOrigin
}

export const INCIDENTS: Incident[] = [
  {
    id: "shop-88",
    kind: "error",
    resource: "shop",
    location: "server.lua:88",
    message: "attempt to index a nil value (field 'price')",
    count: 4,
    lastSeen: 38,
    firstSeen: "12:58",
    introducedBy: { commit: "b41d7c0", author: "admin", summary: "Add armor to the shop", uncommitted: false },
    explanation: {
      title: "Script error in shop",
      what: "Line 88 of shop/server.lua reads price from an item that is not in the shop config, so the purchase handler stops halfway.",
      impact: "Players who try to buy that item get no response and keep their money.",
      fix: "Check that the item exists before reading its price, or add the missing item to the shop config.",
    },
  },
  {
    id: "inventory-hang",
    kind: "hang",
    resource: "inventory",
    location: "server/tick.lua:212",
    message: "Server thread hung for 4.1s",
    count: 1,
    lastSeen: 1260,
    firstSeen: "13:21",
    introducedBy: { commit: "", author: "", summary: "", uncommitted: true },
    explanation: {
      title: "Server thread hung",
      what: "The main server thread was blocked for 4.1 seconds inside inventory/server/tick.lua:212. Nothing else ran during that time.",
      impact: "Every player froze or rubber banded. A longer hang makes the watchdog restart the server.",
      fix: "Look for a long loop or a blocking database call in that tick and move it to a thread or an async query.",
    },
  },
  {
    id: "inventory-tick",
    kind: "warn",
    resource: "inventory",
    location: "tick",
    message: "Tick above 50 ms",
    count: 17,
    lastSeen: 96,
    firstSeen: "10:44",
    explanation: {
      title: "Slow tick",
      what: "inventory took longer than the 50 ms tick budget 17 times today. While a tick runs late, the whole server falls behind.",
      impact: "Players may notice delayed hits and desync during busy rounds.",
      fix: "Open the profiler capture saved at one of the spikes to see which function is slow.",
    },
  },
]

export type Action = { id: string; actor: string; text: string; secondsAgo: number }

export const ACTIONS: Action[] = [
  { id: "a1", actor: "admin", text: "ran restart shop", secondsAgo: 140 },
  { id: "a2", actor: "lia.mod", text: "kicked dusk for AFK", secondsAgo: 610 },
  { id: "a3", actor: "admin", text: "banned kxng-alt for 7 days", secondsAgo: 2280 },
  { id: "a4", actor: "argus", text: "restarted the server on schedule", secondsAgo: 34920 },
  { id: "a5", actor: "lia.mod", text: "warned tornado7 for spawn camping", secondsAgo: 41100 },
]

export const PLAYERS_BY_HOUR = (() => {
  const random = createRandom(7)
  return Array.from({ length: 24 }, (_, hour) => {
    const curve = (hour: number) => 30 + 28 * Math.max(0, Math.sin(((hour - 9) / 24) * Math.PI * 2 - 0.3))
    return {
      hour: `${String(hour).padStart(2, "0")}:00`,
      current: Math.round(curve(hour) + random() * 6 - 3),
      baseline: Math.round(curve(hour) * 0.88 + random() * 6 - 3),
    }
  })
})()

export const INITIAL_TICKS = (() => {
  const random = createRandom(11)
  return Array.from({ length: 60 }, (_, index) => {
    const spike = index === 41 ? 61 : 0
    return spike || Math.round((3.4 + random() * 1.8) * 10) / 10
  })
})()

export const SERVER = {
  name: "arena-01",
  license: "fxserver 12345",
  pid: 18244,
  artifact: "19253",
  onesync: "on",
  maxPlayers: 64,
  endpoint: "203.0.113.24:30120",
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatAgo(seconds: number) {
  if (seconds < 5) return t("now")
  if (seconds < 60) return t("{n}s ago", { n: seconds })
  if (seconds < 3600) return t("{n}m ago", { n: Math.floor(seconds / 60) })
  if (seconds < 86400) return t("{n}h ago", { n: Math.floor(seconds / 3600) })
  return t("{n}d ago", { n: Math.floor(seconds / 86400) })
}
