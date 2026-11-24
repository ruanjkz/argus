import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type IdentifierKind = "license" | "discord" | "steam" | "fivem" | "ip"
export type HistoryType = "warn" | "kick" | "ban" | "unban" | "note"
export type BanStatus = "active" | "expired" | "revoked"

export interface OnlinePlayer {
  id: number
  name: string
  ping: number
  identifiers: Array<string>
  tokens: Array<string>
}

interface HistoryEntry {
  id: string
  type: HistoryType
  actor: string
  reason: string
  time: number
  duration?: string
}

interface KnownPlayer {
  key: string
  name: string
  identifiers: Array<string>
  tokens: Array<string>
  firstSeen: number
  lastSeen: number
  playSeconds: number
  sessions: number
  history: Array<HistoryEntry>
}

interface Ban {
  id: string
  playerKey: string | null
  playerName: string
  identifiers: Array<string>
  tokens: Array<string>
  reason: string
  actor: string
  duration: string
  createdAt: number
  expiresAt: number | null
  revokedAt?: number
  revokedBy?: string
  revokeReason?: string
}

interface Store {
  version: 1
  players: Array<KnownPlayer>
  bans: Array<Ban>
}

export class ModerationError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const KINDS: ReadonlyArray<IdentifierKind> = ["license", "discord", "steam", "fivem", "ip"]
const DURATIONS: Record<string, number | null> = { "1 day": 86_400, "7 days": 604_800, "30 days": 2_592_000, Permanent: null }
const IDENTIFIER_PATTERN = /^(license|discord|steam|fivem|ip):\S+$/
const MAX_HISTORY = 100
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const keyOf = (identifiers: ReadonlyArray<string>) =>
  identifiers.find((identifier) => identifier.startsWith("license:")) ??
  identifiers.find((identifier) => identifier.startsWith("license2:")) ??
  identifiers.find((identifier) => identifier.startsWith("fivem:")) ??
  identifiers[0] ??
  ""

const shortKey = (key: string) => key.replace(/^[a-z0-9]+:/, "").slice(0, 8) || key.slice(0, 8)

const toIdentifiers = (identifiers: ReadonlyArray<string>) =>
  identifiers
    .map((value) => ({ kind: value.slice(0, value.indexOf(":")) as IdentifierKind, value }))
    .filter((identifier) => KINDS.includes(identifier.kind))

const formatDate = (time: number) => {
  const date = new Date(time)
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

const id = () => randomBytes(6).toString("hex")

const banCode = () => `B-${randomBytes(2).readUInt16BE() % 9000 + 1000}`

export class Moderation {
  private data: Store
  private online = new Map<string, OnlinePlayer & { joinedAt: number }>()
  private lastSnapshot = 0

  constructor(
    private readonly home: string,
    private readonly banFile: () => string | undefined,
    private readonly banMessage: () => string,
    private readonly command: (text: string) => Promise<void>
  ) {
    this.data = this.read()
  }

  private get file() {
    return join(this.home, "moderation.json")
  }

  private read(): Store {
    if (!existsSync(this.file)) return { version: 1, players: [], bans: [] }
    const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<Store>
    return { version: 1, players: parsed.players ?? [], bans: parsed.bans ?? [] }
  }

  private save() {
    mkdirSync(this.home, { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(this.data))
    renameSync(temporary, this.file)
  }

  private known(key: string) {
    return this.data.players.find((player) => player.key === key)
  }

  onPlayers(list: ReadonlyArray<OnlinePlayer>, now: number) {
    const elapsed = this.lastSnapshot ? Math.min(60, Math.max(0, (now - this.lastSnapshot) / 1000)) : 0
    this.lastSnapshot = now
    const next = new Map<string, OnlinePlayer & { joinedAt: number }>()
    let changed = false
    for (const player of list) {
      const key = keyOf(player.identifiers)
      if (!key) continue
      const previous = this.online.get(key)
      next.set(key, { ...player, joinedAt: previous?.joinedAt ?? now })
      let record = this.known(key)
      if (!record) {
        record = { key, name: player.name, identifiers: [], tokens: [], firstSeen: now, lastSeen: now, playSeconds: 0, sessions: 0, history: [] }
        this.data.players.push(record)
      }
      if (!previous) record.sessions += 1
      record.name = player.name
      record.lastSeen = now
      record.playSeconds += previous ? elapsed : 0
      record.identifiers = [...new Set([...record.identifiers, ...player.identifiers])]
      record.tokens = [...new Set([...record.tokens, ...player.tokens])].slice(-20)
      changed = true
    }
    for (const key of this.online.keys()) {
      if (next.has(key)) continue
      const record = this.known(key)
      if (record) {
        record.lastSeen = now
        changed = true
      }
    }
    this.online = next
    if (changed) this.save()
  }

  onOffline() {
    this.online.clear()
    this.lastSnapshot = 0
  }

  private activeBan(player: KnownPlayer, now: number) {
    return this.data.bans.find(
      (ban) =>
        !ban.revokedAt &&
        (ban.expiresAt === null || ban.expiresAt > now) &&
        (ban.playerKey === player.key || ban.identifiers.some((identifier) => player.identifiers.includes(identifier)))
    )
  }

  private linked(player: KnownPlayer) {
    const links: Array<{ key: string; reasons: Array<string> }> = []
    const ip = player.identifiers.find((identifier) => identifier.startsWith("ip:"))
    const discord = player.identifiers.find((identifier) => identifier.startsWith("discord:"))
    for (const other of this.data.players) {
      if (other.key === player.key) continue
      const reasons: Array<string> = []
      if (other.tokens.some((token) => player.tokens.includes(token))) reasons.push("same token")
      if (discord && other.identifiers.includes(discord)) reasons.push("same discord")
      if (ip && other.identifiers.includes(ip)) reasons.push("same ip")
      if (reasons.length) links.push({ key: other.key, reasons })
    }
    return links
  }

  players(now: number) {
    return this.data.players
      .map((player) => {
        const online = this.online.get(player.key)
        const ban = this.activeBan(player, now)
        return {
          key: player.key,
          shortKey: shortKey(player.key),
          name: player.name,
          serverId: online?.id ?? 0,
          ping: online?.ping ?? 0,
          online: Boolean(online),
          sessionMinutes: online ? Math.floor((now - online.joinedAt) / 60_000) : 0,
          playtimeMinutes: Math.floor(player.playSeconds / 60),
          sessions: player.sessions,
          firstSeen: formatDate(player.firstSeen),
          lastSeenSeconds: online ? 0 : Math.max(0, Math.floor((now - player.lastSeen) / 1000)),
          identifiers: toIdentifiers(player.identifiers),
          tokens: player.tokens.length,
          linked: this.linked(player),
          history: [...player.history]
            .reverse()
            .map((entry) => ({
              id: entry.id,
              type: entry.type,
              actor: entry.actor,
              reason: entry.reason,
              secondsAgo: Math.max(0, Math.floor((now - entry.time) / 1000)),
              ...(entry.duration ? { duration: entry.duration } : {})
            })),
          ...(ban
            ? { ban: { reason: ban.reason, actor: ban.actor, duration: ban.duration, secondsAgo: Math.max(0, Math.floor((now - ban.createdAt) / 1000)) } }
            : {})
        }
      })
      .sort((first, second) => Number(second.online) - Number(first.online) || first.lastSeenSeconds - second.lastSeenSeconds)
  }

  bans(now: number) {
    return [...this.data.bans]
      .sort((first, second) => second.createdAt - first.createdAt)
      .map((ban) => {
        const status: BanStatus = ban.revokedAt ? "revoked" : ban.expiresAt !== null && ban.expiresAt <= now ? "expired" : "active"
        const total = ban.expiresAt === null ? null : Math.round((ban.expiresAt - ban.createdAt) / 1000)
        return {
          id: ban.id,
          entryId: ban.id,
          playerKey: ban.playerKey,
          playerName: ban.playerName,
          reason: ban.reason,
          actor: ban.actor,
          duration: ban.duration,
          issuedSecondsAgo: Math.max(0, Math.floor((now - ban.createdAt) / 1000)),
          totalSeconds: total,
          remainingSeconds: ban.expiresAt === null ? null : Math.floor((ban.expiresAt - now) / 1000),
          status,
          identifiers: toIdentifiers(ban.identifiers),
          tokens: ban.tokens.length,
          ...(ban.revokedAt
            ? { revokedBy: ban.revokedBy, revokedSecondsAgo: Math.max(0, Math.floor((now - ban.revokedAt) / 1000)), revokeReason: ban.revokeReason }
            : {})
        }
      })
  }

  private player(key: string) {
    const player = this.known(key)
    if (!player) throw new ModerationError(404, "No such player")
    return player
  }

  private record(player: KnownPlayer, entry: Omit<HistoryEntry, "id">) {
    player.history.push({ id: id(), ...entry })
    if (player.history.length > MAX_HISTORY) player.history.splice(0, player.history.length - MAX_HISTORY)
  }

  private clean(text: string) {
    const value = text.replace(/[\r\n;]+/g, " ").replace(/\s+/g, " ").trim()
    if (!value) throw new ModerationError(400, "Write a reason")
    return value.slice(0, 300)
  }

  async warn(actor: string, key: string, reason: string, now: number) {
    const player = this.player(key)
    const text = this.clean(reason)
    this.record(player, { type: "warn", actor, reason: text, time: now })
    this.save()
    const online = this.online.get(key)
    if (online) await this.command(`argus_warn ${online.id} You were warned: ${text}`)
  }

  async message(actor: string, key: string, text: string) {
    const online = this.online.get(key)
    if (!online) throw new ModerationError(409, "That player is not online")
    await this.command(`argus_warn ${online.id} ${this.clean(text)}`)
    void actor
  }

  note(actor: string, key: string, text: string, now: number) {
    const player = this.player(key)
    this.record(player, { type: "note", actor, reason: this.clean(text), time: now })
    this.save()
  }

  async kick(actor: string, key: string, reason: string, now: number) {
    const player = this.player(key)
    const text = this.clean(reason)
    const online = this.online.get(key)
    if (!online) throw new ModerationError(409, "That player is not online")
    this.record(player, { type: "kick", actor, reason: text, time: now })
    this.save()
    await this.command(`argus_kick ${online.id} Kicked: ${text}`)
  }

  private durationSeconds(duration: string) {
    if (!(duration in DURATIONS)) throw new ModerationError(400, "Pick a ban length")
    return DURATIONS[duration] ?? null
  }

  async ban(actor: string, key: string, reason: string, duration: string, includeLinked: boolean, now: number) {
    const player = this.player(key)
    const text = this.clean(reason)
    const seconds = this.durationSeconds(duration)
    const targets = [player, ...(includeLinked ? this.linked(player).map((link) => this.known(link.key)).filter((entry): entry is KnownPlayer => Boolean(entry)) : [])]
    for (const target of targets) {
      if (this.activeBan(target, now)) continue
      this.data.bans.push({
        id: banCode(),
        playerKey: target.key,
        playerName: target.name,
        identifiers: target.identifiers.filter((identifier) => !identifier.startsWith("ip:") || target === player),
        tokens: target.tokens,
        reason: target === player ? text : `${text} (linked to ${player.name})`,
        actor,
        duration,
        createdAt: now,
        expiresAt: seconds === null ? null : now + seconds * 1000
      })
      this.record(target, { type: "ban", actor, reason: text, time: now, duration })
    }
    this.save()
    await this.publish()
    for (const target of targets) {
      const online = this.online.get(target.key)
      if (online) await this.command(`argus_kick ${online.id} Banned: ${text}`)
    }
  }

  async banIdentifier(actor: string, identifier: string, reason: string, duration: string, now: number) {
    const value = identifier.trim()
    if (!IDENTIFIER_PATTERN.test(value)) throw new ModerationError(400, "Use a full identifier, like license:… or discord:…")
    const known = this.data.players.find((player) => player.identifiers.includes(value))
    if (known) return this.ban(actor, known.key, reason, duration, false, now)
    const seconds = this.durationSeconds(duration)
    this.data.bans.push({
      id: banCode(),
      playerKey: null,
      playerName: "Unknown player",
      identifiers: [value],
      tokens: [],
      reason: this.clean(reason),
      actor,
      duration,
      createdAt: now,
      expiresAt: seconds === null ? null : now + seconds * 1000
    })
    this.save()
    await this.publish()
  }

  async revoke(actor: string, banId: string, reason: string, now: number) {
    const ban = this.data.bans.find((entry) => entry.id === banId)
    if (!ban || ban.revokedAt) throw new ModerationError(404, "No active ban with that id")
    ban.revokedAt = now
    ban.revokedBy = actor
    ban.revokeReason = this.clean(reason)
    if (ban.playerKey) {
      const player = this.known(ban.playerKey)
      if (player) this.record(player, { type: "unban", actor, reason: ban.revokeReason, time: now })
    }
    this.save()
    await this.publish()
  }

  async unban(actor: string, key: string, reason: string, now: number) {
    const player = this.player(key)
    const ban = this.activeBan(player, now)
    if (!ban) throw new ModerationError(404, "That player is not banned")
    await this.revoke(actor, ban.id, reason, now)
  }

  async publish() {
    const target = this.banFile()
    if (!target) return
    const now = Date.now()
    const active = this.data.bans
      .filter((ban) => !ban.revokedAt && (ban.expiresAt === null || ban.expiresAt > now))
      .map((ban) => ({
        id: ban.id,
        reason: ban.reason,
        expires: ban.expiresAt === null ? 0 : Math.floor(ban.expiresAt / 1000),
        identifiers: [...ban.identifiers, ...ban.tokens]
      }))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify({ message: this.banMessage(), bans: active }))
    await this.command("argus_reload_bans").catch(() => undefined)
  }
}
