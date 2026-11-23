"use client"

import { useRef, type KeyboardEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, ArrowDown01Icon, ArrowUp01Icon, Link01Icon } from "@hugeicons/core-free-icons"

import type { PlayerView } from "@/components/players-store"
import { formatAgo, formatDuration } from "@/lib/mock"
import { formatPlaytime } from "@/lib/players"
import { cn } from "@/lib/utils"

export type SortKey = "name" | "ping" | "seen" | "playtime"

export type SortState = { key: SortKey; direction: "asc" | "desc" }

const COLUMNS: { key: SortKey; label: string; className: string; align?: "right" }[] = [
  { key: "name", label: "Player", className: "pl-4 pr-2" },
  { key: "ping", label: "Ping", className: "hidden px-2 sm:table-cell", align: "right" },
  { key: "seen", label: "Session", className: "px-2", align: "right" },
  { key: "playtime", label: "Playtime", className: "hidden px-2 md:table-cell lg:hidden xl:table-cell", align: "right" },
]

export function PlayersTable({
  players,
  selectedKey,
  onSelect,
  sort,
  onSortChange,
  elapsed,
}: {
  players: PlayerView[]
  selectedKey: string | null
  onSelect: (key: string) => void
  sort: SortState
  onSortChange: (sort: SortState) => void
  elapsed: number
}) {
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  function focusRow(index: number) {
    const player = players[index]
    if (!player) return
    onSelect(player.key)
    bodyRef.current?.querySelector<HTMLButtonElement>(`[data-player-key="${player.key}"]`)?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const current = players.findIndex((player) => player.key === selectedKey)
    focusRow(event.key === "ArrowDown" ? Math.min(players.length - 1, current + 1) : Math.max(0, current - 1))
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 z-10 bg-background">
        <tr className="border-b border-border/70 text-muted-foreground">
          {COLUMNS.map((column) => {
            const active = sort.key === column.key
            return (
              <th
                key={column.key}
                scope="col"
                aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                className={cn("h-9 font-normal", column.className, column.align === "right" ? "text-right" : "text-left")}
              >
                <button
                  type="button"
                  onClick={() => onSortChange({ key: column.key, direction: active && sort.direction === "asc" ? "desc" : "asc" })}
                  className={cn(
                    "press inline-flex items-center gap-1 rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    active && "text-foreground",
                  )}
                >
                  {column.label}
                  {active ? (
                    <HugeiconsIcon icon={sort.direction === "asc" ? ArrowUp01Icon : ArrowDown01Icon} strokeWidth={1.75} className="size-3" />
                  ) : null}
                </button>
              </th>
            )
          })}
          <th scope="col" className="h-9 pr-4 pl-2 text-right font-normal">
            Flags
          </th>
        </tr>
      </thead>
      <tbody ref={bodyRef} onKeyDown={handleKeyDown} className="divide-y divide-border/50">
        {players.map((player) => {
          const selected = player.key === selectedKey
          const warnings = player.history.filter((entry) => entry.type === "warn").length
          return (
            <tr
              key={player.key}
              aria-selected={selected}
              onClick={() => onSelect(player.key)}
              className={cn("cursor-default transition-colors hover:bg-muted/50", selected && "bg-muted hover:bg-muted")}
            >
              <td className="w-full max-w-0 py-2 pr-2 pl-4">
                <button
                  type="button"
                  data-player-key={player.key}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(player.key)
                  }}
                  tabIndex={selected || (!selectedKey && player === players[0]) ? 0 : -1}
                  aria-current={selected ? "true" : undefined}
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      player.banned ? "bg-destructive" : player.online ? "bg-success" : "bg-muted-foreground/40",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className={cn("block truncate text-[13px]", player.banned ? "text-muted-foreground line-through decoration-destructive/60" : "text-foreground/90")}>
                      {player.name}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground tabular-nums">
                      {player.banned ? "banned" : player.online ? `id ${player.serverId}` : "offline"}
                    </span>
                  </span>
                </button>
              </td>
              <td className={cn("hidden px-2 py-2 text-right font-mono whitespace-nowrap tabular-nums sm:table-cell", player.livePing > 70 ? "text-warning" : "text-foreground/80")}>
                {player.online ? `${player.livePing} ms` : <span className="text-muted-foreground/50">—</span>}
              </td>
              <td className="px-2 py-2 text-right font-mono whitespace-nowrap text-foreground/80 tabular-nums">
                {player.online ? (
                  formatDuration(player.liveSessionMinutes * 60)
                ) : (
                  <span className="text-muted-foreground">{formatAgo(player.lastSeenSeconds + elapsed)}</span>
                )}
              </td>
              <td className="hidden px-2 py-2 text-right font-mono whitespace-nowrap text-foreground/80 tabular-nums md:table-cell lg:hidden xl:table-cell">{formatPlaytime(player.playtimeMinutes)}</td>
              <td className="py-2 pr-4 pl-2">
                <span className="flex items-center justify-end gap-2.5 font-mono text-[11px]">
                  {warnings ? (
                    <span className="inline-flex items-center gap-1 text-warning" title={`${warnings} warnings`}>
                      <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="size-3.5" />
                      {warnings}
                    </span>
                  ) : null}
                  {player.linked.length ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground" title={`${player.linked.length} linked accounts`}>
                      <HugeiconsIcon icon={Link01Icon} strokeWidth={1.75} className="size-3.5" />
                      {player.linked.length}
                    </span>
                  ) : null}
                  {!warnings && !player.linked.length ? <span className="text-muted-foreground/40">—</span> : null}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
