import type { HistoryEntry, Identifier } from "./players"

export type BanStatus = "active" | "expired" | "revoked"

export type BanRecord = {
  id: string
  entryId: string
  playerKey: string | null
  playerName: string
  reason: string
  actor: string
  duration: string
  issuedSecondsAgo: number
  totalSeconds: number | null
  remainingSeconds: number | null
  status: BanStatus
  revokedBy?: string
  revokedSecondsAgo?: number
  revokeReason?: string
  identifiers: Identifier[]
  tokens: number
}

export type ManualBan = {
  entryId: string
  identifier: Identifier
  reason: string
  duration: string
  secondsAgo: number
  revoked?: { actor: string; reason: string; secondsAgo: number }
}

export const BAN_DURATIONS = ["1 day", "7 days", "30 days", "Permanent"]

export const IDENTIFIER_PATTERN = /^(license|discord|steam|fivem|ip):\S+$/

const DAY_SECONDS = 86400

export function durationSeconds(duration: string): number | null {
  const match = /^(\d+)\s+day/.exec(duration)
  return match ? Number(match[1]) * DAY_SECONDS : null
}

export function banDisplayId(entryId: string) {
  let hash = 0
  for (const character of entryId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return `B-${1000 + (hash % 9000)}`
}

export function formatRemaining(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / DAY_SECONDS)
  const hours = Math.floor((total % DAY_SECONDS) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}

type BanSubject = {
  key: string
  name: string
  banned: boolean
  identifiers: Identifier[]
  tokens: number
  history: HistoryEntry[]
}

export function recordsForPlayer(player: BanSubject, elapsed: number): BanRecord[] {
  const chronological = player.history
    .filter((entry) => entry.type === "ban" || entry.type === "unban")
    .sort((first, second) => second.secondsAgo - first.secondsAgo)
  const records: BanRecord[] = []
  let open: BanRecord | null = null

  for (const entry of chronological) {
    const age = Math.max(0, entry.secondsAgo + elapsed)
    if (entry.type === "unban") {
      if (!open) continue
      open.status = "revoked"
      open.revokedBy = entry.actor
      open.revokedSecondsAgo = age
      open.revokeReason = entry.reason
      open = null
      continue
    }
    if (open) open.status = "expired"
    const duration = entry.duration ?? "Permanent"
    const totalSeconds = durationSeconds(duration)
    open = {
      id: banDisplayId(entry.id),
      entryId: entry.id,
      playerKey: player.key,
      playerName: player.name,
      reason: entry.reason,
      actor: entry.actor,
      duration,
      issuedSecondsAgo: age,
      totalSeconds,
      remainingSeconds: totalSeconds === null ? null : totalSeconds - age,
      status: "expired",
      identifiers: player.identifiers,
      tokens: player.tokens,
    }
    records.push(open)
  }

  if (open && player.banned) open.status = "active"
  return records
}

export function recordForManualBan(ban: ManualBan, elapsed: number): BanRecord {
  const age = Math.max(0, ban.secondsAgo + elapsed)
  const totalSeconds = durationSeconds(ban.duration)
  const remainingSeconds = totalSeconds === null ? null : totalSeconds - age
  const expired = remainingSeconds !== null && remainingSeconds <= 0
  return {
    id: banDisplayId(ban.entryId),
    entryId: ban.entryId,
    playerKey: null,
    playerName: "Unknown player",
    reason: ban.reason,
    actor: "you",
    duration: ban.duration,
    issuedSecondsAgo: age,
    totalSeconds,
    remainingSeconds,
    status: ban.revoked ? "revoked" : expired ? "expired" : "active",
    identifiers: [ban.identifier],
    tokens: 0,
    ...(ban.revoked
      ? {
          revokedBy: ban.revoked.actor,
          revokedSecondsAgo: Math.max(0, ban.revoked.secondsAgo + elapsed),
          revokeReason: ban.revoked.reason,
        }
      : {}),
  }
}
