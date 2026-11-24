"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useConsole } from "@/components/console-store"
import { useLiveServer } from "@/components/live-server"
import { recordForManualBan, recordsForPlayer, type BanRecord, type ManualBan } from "@/lib/bans"
import { ONLINE_ORDER, ROSTER, type BanInfo, type HistoryEntry, type HistoryType, type Identifier, type IdentifierKind, type RosterPlayer } from "@/lib/players"

export type PlayerView = RosterPlayer & {
  online: boolean
  livePing: number
  liveSessionMinutes: number
  banned: boolean
}

type PlayersStore = {
  players: PlayerView[]
  online: PlayerView[]
  byKey: Map<string, PlayerView>
  banRecords: BanRecord[]
  elapsed: number
  warn: (key: string, reason: string) => void
  kick: (key: string, reason: string) => void
  ban: (key: string, reason: string, duration: string, includeLinked: boolean) => void
  unban: (key: string, reason?: string) => void
  banIdentifier: (identifier: string, reason: string, duration: string) => void
  revokeManualBan: (entryId: string, reason: string) => void
  note: (key: string, text: string) => void
  message: (key: string, text: string) => void
}

type Overrides = {
  history: Record<string, HistoryEntry[]>
  bans: Record<string, BanInfo | null>
  removed: string[]
  manualBans: ManualBan[]
}

const PlayersContext = createContext<PlayersStore | null>(null)

function hash(value: string) {
  let result = 0
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0
  return result
}

export function PlayersProvider({ children }: { children: ReactNode }) {
  const live = useLiveServer()
  const consoleStore = useConsole()
  const [overrides, setOverrides] = useState<Overrides>({ history: {}, bans: {}, removed: [], manualBans: [] })
  const [elapsed, setElapsed] = useState(0)
  const entryId = useRef(0)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      if (startedAt.current === null) startedAt.current = performance.now()
      setElapsed(Math.floor((performance.now() - startedAt.current) / 1000))
    }, 3000)
    return () => window.clearInterval(timer)
  }, [])

  const players = useMemo<PlayerView[]>(() => {
    const isBanned = (player: RosterPlayer) => {
      const override = overrides.bans[player.key]
      return override === undefined ? Boolean(player.ban) : override !== null
    }
    const onlineKeys = new Set(
      live.status === "online"
        ? ONLINE_ORDER.filter((key) => !overrides.removed.includes(key) && !isBanned(ROSTER.find((player) => player.key === key)!)).slice(0, live.players)
        : [],
    )
    const tick = Math.floor(elapsed / 3)
    return ROSTER.map((player) => {
      const override = overrides.bans[player.key]
      const ban = override === undefined ? player.ban : (override ?? undefined)
      return {
        ...player,
        ban,
        banned: Boolean(ban),
        history: [...(overrides.history[player.key] ?? []), ...player.history],
        online: onlineKeys.has(player.key),
        livePing: Math.max(8, player.ping + ((hash(player.key) + tick * 7) % 9) - 4),
        liveSessionMinutes: player.sessionMinutes + Math.floor(elapsed / 60),
      }
    })
  }, [overrides, live.status, live.players, elapsed])

  const byKey = useMemo(() => new Map(players.map((player) => [player.key, player])), [players])
  const online = useMemo(() => {
    const order = new Map(ONLINE_ORDER.map((key, index) => [key, index]))
    return players.filter((player) => player.online).sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
  }, [players])

  const byKeyRef = useRef(byKey)
  const elapsedRef = useRef(elapsed)
  useEffect(() => {
    byKeyRef.current = byKey
    elapsedRef.current = elapsed
  })

  const addHistory = useCallback((key: string, type: HistoryType, reason: string, duration?: string) => {
    entryId.current += 1
    const entry: HistoryEntry = { id: `h-new-${entryId.current}`, type, actor: "you", reason, duration, secondsAgo: -elapsedRef.current }
    setOverrides((previous) => ({
      ...previous,
      history: { ...previous.history, [key]: [entry, ...(previous.history[key] ?? [])] },
    }))
  }, [])

  const dropFromServer = useCallback(
    (key: string) => {
      const player = byKeyRef.current.get(key)
      if (!player?.online) return
      setOverrides((previous) => ({ ...previous, removed: [...previous.removed, key] }))
      live.adjustPlayers(-1)
    },
    [live],
  )

  const warn = useCallback(
    (key: string, reason: string) => {
      const player = byKeyRef.current.get(key)
      if (!player) return
      addHistory(key, "warn", reason)
      live.logAction(`warned ${player.name} for ${reason.toLowerCase()}`)
      consoleStore.announce(`Warning shown to ${player.name}: ${reason}`)
    },
    [addHistory, live, consoleStore],
  )

  const kick = useCallback(
    (key: string, reason: string) => {
      const player = byKeyRef.current.get(key)
      if (!player?.online) return
      addHistory(key, "kick", reason)
      dropFromServer(key)
      live.logAction(`kicked ${player.name} for ${reason.toLowerCase()}`)
      consoleStore.announce(`Kicked ${player.name}  id ${player.serverId}: ${reason}`)
    },
    [addHistory, dropFromServer, live, consoleStore],
  )

  const ban = useCallback(
    (key: string, reason: string, duration: string, includeLinked: boolean) => {
      const player = byKeyRef.current.get(key)
      if (!player) return
      const targets = [player, ...(includeLinked ? player.linked.map((link) => byKeyRef.current.get(link.key)).filter((entry) => entry && !entry.banned) : [])] as PlayerView[]
      const info: BanInfo = { reason, actor: "you", duration, secondsAgo: -elapsedRef.current }
      setOverrides((previous) => {
        const bans = { ...previous.bans }
        for (const target of targets) bans[target.key] = target.key === key ? info : { ...info, reason: `${reason}, linked to ${player.name}` }
        return { ...previous, bans }
      })
      for (const target of targets) {
        addHistory(target.key, "ban", target.key === key ? reason : `${reason}, linked to ${player.name}`, duration)
        dropFromServer(target.key)
      }
      const extra = targets.length > 1 ? ` and ${targets.length - 1} linked account${targets.length > 2 ? "s" : ""}` : ""
      live.logAction(`banned ${player.name}${extra} for ${duration.toLowerCase()}`)
      consoleStore.announce(`Banned ${player.name}${extra}  ${duration}: ${reason}`)
    },
    [addHistory, dropFromServer, live, consoleStore],
  )

  const unban = useCallback(
    (key: string, reason = "Ban revoked") => {
      const player = byKeyRef.current.get(key)
      if (!player?.banned) return
      setOverrides((previous) => ({ ...previous, bans: { ...previous.bans, [key]: null } }))
      addHistory(key, "unban", reason)
      live.logAction(`revoked the ban on ${player.name}`)
      consoleStore.announce(`Ban revoked for ${player.name}`)
    },
    [addHistory, live, consoleStore],
  )

  const banIdentifier = useCallback(
    (value: string, reason: string, duration: string) => {
      const known = [...byKeyRef.current.values()].find((player) => player.identifiers.some((identifier) => identifier.value === value))
      if (known) {
        ban(known.key, reason, duration, false)
        return
      }
      entryId.current += 1
      const identifier: Identifier = { kind: value.slice(0, value.indexOf(":")) as IdentifierKind, value }
      const manual: ManualBan = { entryId: `h-manual-${entryId.current}`, identifier, reason, duration, secondsAgo: -elapsedRef.current }
      setOverrides((previous) => ({ ...previous, manualBans: [manual, ...previous.manualBans] }))
      live.logAction(`banned ${value.length > 22 ? `${value.slice(0, 22)}…` : value} for ${duration.toLowerCase()}`)
      consoleStore.announce(`Banned ${value}  ${duration}: ${reason}`)
    },
    [ban, live, consoleStore],
  )

  const revokeManualBan = useCallback(
    (manualId: string, reason: string) => {
      const secondsAgo = -elapsedRef.current
      setOverrides((previous) => ({
        ...previous,
        manualBans: previous.manualBans.map((entry) =>
          entry.entryId === manualId && !entry.revoked ? { ...entry, revoked: { actor: "you", reason, secondsAgo } } : entry,
        ),
      }))
      live.logAction("revoked a ban by identifier")
      consoleStore.announce(`Ban revoked: ${reason}`)
    },
    [live, consoleStore],
  )

  const banRecords = useMemo<BanRecord[]>(
    () =>
      [
        ...players.flatMap((player) => recordsForPlayer(player, elapsed)),
        ...overrides.manualBans.map((entry) => recordForManualBan(entry, elapsed)),
      ].sort((first, second) => first.issuedSecondsAgo - second.issuedSecondsAgo),
    [players, overrides.manualBans, elapsed],
  )

  const note = useCallback((key: string, text: string) => addHistory(key, "note", text), [addHistory])

  const message = useCallback(
    (key: string, text: string) => {
      const player = byKeyRef.current.get(key)
      if (!player?.online) return
      consoleStore.announce(`Message to ${player.name}: ${text}`)
    },
    [consoleStore],
  )

  const value = useMemo<PlayersStore>(
    () => ({ players, online, byKey, banRecords, elapsed, warn, kick, ban, unban, banIdentifier, revokeManualBan, note, message }),
    [players, online, byKey, banRecords, elapsed, warn, kick, ban, unban, banIdentifier, revokeManualBan, note, message],
  )

  return <PlayersContext.Provider value={value}>{children}</PlayersContext.Provider>
}

export function usePlayers() {
  const context = useContext(PlayersContext)
  if (!context) throw new Error("usePlayers must be used inside PlayersProvider")
  return context
}
