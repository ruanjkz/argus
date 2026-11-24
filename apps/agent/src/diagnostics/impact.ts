import type { Impact, ProblemKind, Severity } from "./model.ts"

const HOUR_MS = 3_600_000
const SEVERITIES: ReadonlyArray<Severity> = ["low", "medium", "high", "critical"]
const OUTAGE_KINDS: ReadonlySet<ProblemKind> = new Set(["crashed", "port-in-use", "boot-timeout", "heartbeat-lost"])
const MINIMUM_SEVERITY: Partial<Record<ProblemKind, Severity>> = {
  "thread-hang": "medium",
  crashed: "high",
  "port-in-use": "high",
  "boot-timeout": "high",
  "heartbeat-lost": "high",
  "spawn-failed": "critical",
  "crash-loop": "critical"
}

export interface Occurrence {
  readonly time: number
  readonly players: number
  durationMs: number
  ongoingSince: number | undefined
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

export const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`
  const seconds = Math.round(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const durationOf = (occurrence: Occurrence, now: number) =>
  occurrence.ongoingSince === undefined ? occurrence.durationMs : Math.max(0, now - occurrence.ongoingSince)

const severityFor = (kind: ProblemKind, score: number): Severity => {
  const measured: Severity = score >= 300 ? "critical" : score >= 30 ? "high" : score >= 5 ? "medium" : "low"
  const minimum = MINIMUM_SEVERITY[kind] ?? "low"
  return SEVERITIES.indexOf(measured) >= SEVERITIES.indexOf(minimum) ? measured : minimum
}

const summarize = (
  kind: ProblemKind,
  count: number,
  lastHour: number,
  worstMs: number,
  latest: Occurrence | undefined,
  now: number
): string => {
  const players = latest?.players ?? 0
  const online = players > 0 ? ` with ${plural(players, "player")} online` : ""

  if (kind === "hitch") {
    return `${plural(lastHour, "stall")} in the last hour, worst ${formatDuration(worstMs)}${online}`
  }

  if (kind === "thread-hang") {
    const duration = latest ? durationOf(latest, now) : 0
    const head = duration > 0
      ? `Froze ${plural(players, "player")} for ${formatDuration(duration)}`
      : `Server thread stopped responding${online}`
    return lastHour > 1 ? `${head}, ${lastHour} times in the last hour` : head
  }

  if (OUTAGE_KINDS.has(kind)) {
    const duration = latest ? durationOf(latest, now) : 0
    const stillDown = latest?.ongoingSince !== undefined
    const head = duration > 0
      ? `Server ${stillDown ? "has been offline" : "was offline"} for ${formatDuration(duration)}`
      : "Server went down"
    const lost = players > 0 ? `, ${plural(players, "player")} disconnected` : ""
    return lastHour > 1 ? `${head}${lost}, ${lastHour} times in the last hour` : `${head}${lost}`
  }

  return `${plural(count, "time")}, ${lastHour} in the last hour${online}`
}

export const computeImpact = (
  kind: ProblemKind,
  count: number,
  occurrences: ReadonlyArray<Occurrence>,
  now: number
): Impact => {
  const recent = occurrences.filter((occurrence) => now - occurrence.time <= HOUR_MS)
  const latest = occurrences[occurrences.length - 1]
  let disruptedPlayerSeconds = 0
  let worstMs = 0
  for (const occurrence of recent) {
    const duration = durationOf(occurrence, now)
    disruptedPlayerSeconds += (duration / 1000) * occurrence.players
    worstMs = Math.max(worstMs, duration)
  }
  const score = Math.round((disruptedPlayerSeconds + recent.length * 0.5) * 10) / 10
  return {
    severity: severityFor(kind, score),
    score,
    summary: summarize(kind, count, recent.length, worstMs, latest, now),
    lastHour: recent.length,
    players: latest?.players ?? 0,
    disruptedPlayerSeconds: Math.round(disruptedPlayerSeconds * 10) / 10,
    worstMs
  }
}
