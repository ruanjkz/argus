"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { agentCall } from "@/components/agent-store"
import type { BanRecord } from "@/lib/bans"
import type { RosterPlayer } from "@/lib/players"

type AgentPlayer = RosterPlayer & { online: boolean }

export type LivePlayerView = RosterPlayer & { online: boolean; livePing: number; liveSessionMinutes: number; banned: boolean }

const POLL_MS = 3000

export function useLivePlayers(enabled: boolean, onError: (message: string) => void) {
  const [players, setPlayers] = useState<AgentPlayer[]>([])
  const [bans, setBans] = useState<BanRecord[]>([])
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = async () => {
      try {
        const [nextPlayers, nextBans] = await Promise.all([agentCall<AgentPlayer[]>("GET", "players"), agentCall<BanRecord[]>("GET", "bans")])
        if (cancelled) return
        setPlayers(nextPlayers)
        setBans(nextBans)
      } catch {
        return
      }
    }
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled, version])

  const act = useCallback(
    (path: string, body: Record<string, unknown>) => {
      agentCall("POST", path, body)
        .then(() => setVersion((value) => value + 1))
        .catch((error: unknown) => onError(error instanceof Error ? error.message : "That did not work"))
    },
    [onError],
  )

  const views = useMemo<LivePlayerView[]>(
    () => players.map((player) => ({ ...player, livePing: player.ping, liveSessionMinutes: player.sessionMinutes, banned: Boolean(player.ban) })),
    [players],
  )

  return {
    players: views,
    bans,
    warn: (key: string, reason: string) => act("players/warn", { key, reason }),
    kick: (key: string, reason: string) => act("players/kick", { key, reason }),
    ban: (key: string, reason: string, duration: string, includeLinked: boolean) => act("players/ban", { key, reason, duration, includeLinked }),
    unban: (key: string, reason?: string) => act("players/unban", { key, reason: reason ?? "Ban revoked" }),
    banIdentifier: (identifier: string, reason: string, duration: string) => act("bans", { identifier, reason, duration }),
    revokeManualBan: (entryId: string, reason: string) => act("bans/revoke", { id: entryId, reason }),
    note: (key: string, text: string) => act("players/note", { key, text }),
    message: (key: string, text: string) => act("players/message", { key, text }),
  }
}
