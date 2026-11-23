import { createRandom, PLAYERS, RESOURCES } from "./mock"

export type ConsoleKind = "stdout" | "stderr" | "command" | "system" | "warn"

export type ConsoleLine = {
  id: number
  time: string
  kind: ConsoleKind
  source: string
  tag?: string
  text: string
}

export type ConsoleDraft = Omit<ConsoleLine, "id" | "time">

export type Role = "moderator" | "admin" | "owner"

export const ROLE_RANK: Record<Role, number> = { moderator: 1, admin: 2, owner: 3 }

export const CURRENT_ROLE: Role = "admin"

export type RegisteredCommand = {
  name: string
  args?: string
  description: string
  minRole: Role
  resource: string
}

export const REGISTERED_COMMANDS: RegisteredCommand[] = [
  { name: "status", description: "List connected players", minRole: "moderator", resource: "citizen" },
  { name: "say", args: "<message>", description: "Broadcast a chat message", minRole: "moderator", resource: "chat" },
  { name: "clientkick", args: "<id> <reason>", description: "Kick a player", minRole: "moderator", resource: "citizen" },
  { name: "ensure", args: "<resource>", description: "Start or restart a resource", minRole: "admin", resource: "citizen" },
  { name: "start", args: "<resource>", description: "Start a resource", minRole: "admin", resource: "citizen" },
  { name: "stop", args: "<resource>", description: "Stop a resource", minRole: "admin", resource: "citizen" },
  { name: "restart", args: "<resource>", description: "Restart a resource", minRole: "admin", resource: "citizen" },
  { name: "refresh", description: "Rescan resource folders", minRole: "admin", resource: "citizen" },
  { name: "profiler", args: "record <frames>", description: "Record a server profile", minRole: "admin", resource: "citizen" },
  { name: "set", args: "<convar> <value>", description: "Set a convar", minRole: "owner", resource: "citizen" },
  { name: "exec", args: "<file>", description: "Run a config file", minRole: "owner", resource: "citizen" },
  { name: "quit", args: "[reason]", description: "Stop the server", minRole: "owner", resource: "citizen" },
]

export function canRun(command: RegisteredCommand, role: Role = CURRENT_ROLE) {
  return ROLE_RANK[role] >= ROLE_RANK[command.minRole]
}

const CHANNEL_COLORS = [92, 93, 94, 95, 96, 32, 33, 36]

export function channel(name: string) {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  const color = CHANNEL_COLORS[hash % CHANNEL_COLORS.length]
  return `\x1b[${color}m[${name.padStart(10)}]\x1b[0m`
}

export function formatClock(totalSeconds: number) {
  const value = ((totalSeconds % 86400) + 86400) % 86400
  return [Math.floor(value / 3600), Math.floor((value % 3600) / 60), value % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":")
}

export const CONSOLE_START_SECONDS = 10 * 3600 + 30 * 60

export const CONSOLE_END_SECONDS = 13 * 3600 + 42 * 60 + 40

export function bootLines(artifact: string, startedIn: string): ConsoleDraft[] {
  const started = RESOURCES.filter((resource) => resource.state !== "stopped")
  return [
    { kind: "system", source: "argus", tag: "argus", text: `Starting FXServer with server.cfg  artifact ${artifact}` },
    { kind: "stdout", source: "citizen-server-impl", text: `${channel("citizen")} Server license key authentication succeeded. Welcome!` },
    { kind: "stdout", source: "resources", text: `${channel("resources")} Scanning resources.` },
    { kind: "stdout", source: "resources", text: `${channel("resources")} Found ${RESOURCES.length} resources.` },
    ...started.map<ConsoleDraft>((resource) => ({
      kind: "stdout",
      source: "resources",
      text: `${channel("resources")} Started resource ${resource.name}`,
    })),
    { kind: "stdout", source: "citizen-server-impl", text: `${channel("citizen")} Server is reachable on cfx.re` },
    { kind: "system", source: "argus", tag: "argus", text: `Server online in ${startedIn}` },
  ]
}

const MAPS = ["Vinewood", "Sandy Shores", "Docks", "Paleto"]

export function chatterLine(random: () => number, round: number): ConsoleDraft {
  const player = PLAYERS[Math.floor(random() * PLAYERS.length)]
  const roll = random()
  if (roll < 0.22) return { kind: "system", source: "argus", tag: "argus", text: `${player.name} joined  id ${player.id}` }
  if (roll < 0.36) return { kind: "system", source: "argus", tag: "argus", text: `${player.name} left  ${random() < 0.5 ? "quit" : "timed out"}` }
  if (roll < 0.58)
    return {
      kind: "stdout",
      source: "arena",
      text: `${channel("script:arena")} Round ${round} started on ${MAPS[Math.floor(random() * MAPS.length)]}`,
    }
  if (roll < 0.78) {
    const red = 5
    const blue = Math.floor(random() * 5)
    return { kind: "stdout", source: "arena", text: `${channel("script:arena")} Round ${round} won by red, ${red} to ${blue}` }
  }
  if (roll < 0.9)
    return {
      kind: "stdout",
      source: "matchmaking",
      text: `${channel("matchmaking")} Queue ${2 + Math.floor(random() * 10)} players  avg wait ${8 + Math.floor(random() * 30)}s`,
    }
  return { kind: "stdout", source: "ranked", text: `${channel("ranked")} ${player.name} reached ${1200 + Math.floor(random() * 600)} MMR` }
}

export function shopErrorLines(grouped: number): ConsoleDraft[] {
  return [
    { kind: "stderr", source: "shop", tag: "stderr", text: "SCRIPT ERROR: @shop/server.lua:88: attempt to index a nil value (field 'price')" },
    { kind: "system", source: "argus", tag: "argus", text: `Error grouped with ${grouped} earlier events in shop/server.lua:88` },
  ]
}

export function slowTickLine(value: number): ConsoleDraft {
  return { kind: "warn", source: "inventory", tag: "warn", text: `${channel("inventory")} Slow tick: ${Math.round(value)} ms` }
}

export const INITIAL_CONSOLE: ConsoleLine[] = (() => {
  const random = createRandom(2026)
  const lines: ConsoleLine[] = []
  let seconds = CONSOLE_START_SECONDS
  const push = (draft: ConsoleDraft, step = 0) => {
    seconds += step
    lines.push({ ...draft, id: lines.length, time: formatClock(seconds) })
  }
  bootLines("19253", "7.2s").forEach((draft, index) => push(draft, index === 0 ? 0 : index % 5 === 0 ? 1 : 0))
  let round = 1
  while (seconds < CONSOLE_END_SECONDS - 400) {
    const step = 40 + Math.floor(random() * 120)
    const roll = random()
    if (roll < 0.08) {
      push({ kind: "command", source: "console", tag: "lia.mod", text: `clientkick ${PLAYERS[3].id} AFK` }, step)
      push({ kind: "system", source: "argus", tag: "argus", text: `Kicked ${PLAYERS[3].name}: AFK` }, 0)
    } else if (roll < 0.15) {
      push(slowTickLine(40 + random() * 30), step)
    } else {
      const draft = chatterLine(random, round)
      if (draft.text.includes("won by")) round += 1
      push(draft, step)
    }
  }
  push({ kind: "command", source: "console", tag: "admin", text: "ensure shop" }, 60)
  push({ kind: "stdout", source: "resources", text: `${channel("resources")} Started resource shop` }, 0)
  shopErrorLines(3).forEach((draft, index) => push(draft, index === 0 ? 21 : 0))
  push(slowTickLine(61), 2)
  return lines
})()

export type AnsiTone =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"

export type AnsiSegment = { text: string; tone?: AnsiTone; bold?: boolean }

const TONES: AnsiTone[] = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"]

const ESCAPE = String.fromCharCode(27)

const SGR_PATTERN = new RegExp(`${ESCAPE}\\[([\\d;]*)m`, "g")

export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  const pattern = new RegExp(SGR_PATTERN.source, "g")
  let tone: AnsiTone | undefined
  let bold = false
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input))) {
    if (match.index > cursor) segments.push({ text: input.slice(cursor, match.index), tone, bold })
    cursor = pattern.lastIndex
    const codes = match[1] === "" ? [0] : match[1].split(";").map(Number)
    for (const code of codes) {
      if (code === 0) {
        tone = undefined
        bold = false
      } else if (code === 1) bold = true
      else if (code === 22) bold = false
      else if (code === 39) tone = undefined
      else if (code >= 30 && code <= 37) tone = TONES[code - 30]
      else if (code >= 90 && code <= 97) tone = TONES[code - 90]
    }
  }
  if (cursor < input.length) segments.push({ text: input.slice(cursor), tone, bold })
  return segments
}

export function stripAnsi(input: string) {
  return input.replace(new RegExp(SGR_PATTERN.source, "g"), "")
}
