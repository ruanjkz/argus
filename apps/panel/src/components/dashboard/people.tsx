"use client"

import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"

import { useLiveServer } from "@/components/live-server"
import { usePlayers } from "@/components/players-store"
import { formatAgo, formatDuration } from "@/lib/mock"
import { cn } from "@/lib/utils"

import { Panel } from "./panel"

const VISIBLE_PLAYERS = 8

export function OnlinePlayers() {
  const { players, status } = useLiveServer()
  const { online } = usePlayers()
  const rows = online.slice(0, VISIBLE_PLAYERS)
  const emptyText =
    status === "offline" ? "The server is offline. Start it from the header." : status === "online" ? "Nobody is online." : "No players until the server is back online."

  return (
    <Panel
      title="Online players"
      meta={`${players} connected`}
      action={
        <Link
          href="/players"
          className="press inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          View all
          <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={1.75} className="size-3.5" />
        </Link>
      }
      bodyClassName="px-0 pb-0"
    >
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-xs">
            <thead>
              <tr className="border-y border-border/70 bg-muted/60 text-muted-foreground">
                <th scope="col" className="w-14 px-4 py-1.5 text-left font-normal">ID</th>
                <th scope="col" className="px-2 py-1.5 text-left font-normal">Name</th>
                <th scope="col" className="px-2 py-1.5 text-right font-normal">Ping</th>
                <th scope="col" className="px-4 py-1.5 text-right font-normal">Online</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70 font-mono tabular-nums">
              {rows.map((player) => (
                <tr key={player.key} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-2 text-muted-foreground">{player.serverId}</td>
                  <td className="w-full max-w-0 truncate px-2 py-2 font-sans text-[13px] text-foreground/90">{player.name}</td>
                  <td className={cn("px-2 py-2 text-right", player.livePing > 70 ? "text-warning" : "text-foreground/80")}>{player.livePing} ms</td>
                  <td className="px-4 py-2 text-right text-foreground/80">{formatDuration(player.liveSessionMinutes * 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

export function RecentActions() {
  const { actions } = useLiveServer()
  return (
    <Panel title="Recent actions" meta="admins and automations" bodyClassName="px-2 pb-2">
      <ul className="flex flex-col">
        {actions.map((action) => (
          <li key={action.id} className="flex items-baseline gap-3 rounded-xl px-2 py-2 text-[13px]">
            <p className="min-w-0 flex-1 truncate">
              <span className="font-medium text-foreground/90">{action.actor}</span>{" "}
              <span className="text-muted-foreground">{action.text}</span>
            </p>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{formatAgo(action.secondsAgo)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
