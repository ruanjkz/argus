import { formatRemaining, type BanRecord, type BanStatus } from "@/lib/bans"
import { formatAgo } from "@/lib/mock"

export const BAN_STATUS: Record<BanStatus, { label: string; dot: string; text: string }> = {
  active: { label: "Active", dot: "bg-destructive", text: "text-destructive" },
  expired: { label: "Expired", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  revoked: { label: "Revoked", dot: "bg-success", text: "text-success" },
}

export function endedSecondsAgo(record: BanRecord) {
  if (record.status === "revoked") return record.revokedSecondsAgo ?? 0
  if (record.remainingSeconds === null) return 0
  return Math.max(0, -record.remainingSeconds)
}

export function expiryLabel(record: BanRecord) {
  if (record.status === "revoked") return `revoked ${formatAgo(endedSecondsAgo(record))}`
  if (record.status === "expired") return `ended ${formatAgo(endedSecondsAgo(record))}`
  if (record.remainingSeconds === null) return "never"
  return `in ${formatRemaining(record.remainingSeconds)}`
}

export function expirySortValue(record: BanRecord) {
  if (record.status !== "active") return -endedSecondsAgo(record) - 1
  return record.remainingSeconds ?? Number.MAX_SAFE_INTEGER
}
