"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"

import { usePlayers, type PlayerView } from "@/components/players-store"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { handleRadioKeyDown } from "@/lib/radio-group"
import { cn } from "@/lib/utils"

import { PlayerDetail } from "./player-detail"
import { PlayersTable, type SortState } from "./players-table"

type Filter = "online" | "all" | "flagged" | "banned"

function isFlagged(player: PlayerView, byKey: Map<string, PlayerView>) {
  return (
    player.banned ||
    player.history.some((entry) => entry.type === "warn") ||
    player.linked.some((link) => byKey.get(link.key)?.banned)
  )
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)")
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  return desktop
}

export function PlayersPage() {
  const { players, online, byKey, elapsed } = usePlayers()
  const [filter, setFilter] = useState<Filter>("online")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortState>({ key: "name", direction: "asc" })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const desktop = useIsDesktop()

  const counts = useMemo(
    () => ({
      online: online.length,
      all: players.length,
      flagged: players.filter((player) => isFlagged(player, byKey)).length,
      banned: players.filter((player) => player.banned).length,
    }),
    [players, online, byKey],
  )

  const visible = useMemo(() => {
    const base =
      filter === "online"
        ? online
        : filter === "flagged"
          ? players.filter((player) => isFlagged(player, byKey))
          : filter === "banned"
            ? players.filter((player) => player.banned)
            : players
    const searched = deferredQuery
      ? base.filter(
          (player) =>
            player.name.toLowerCase().includes(deferredQuery) ||
            (player.online && String(player.serverId) === deferredQuery) ||
            player.identifiers.some((identifier) => identifier.value.toLowerCase().includes(deferredQuery)),
        )
      : base
    const direction = sort.direction === "asc" ? 1 : -1
    const value = (player: PlayerView) => {
      if (sort.key === "ping") return player.online ? player.livePing : Number.MAX_SAFE_INTEGER
      if (sort.key === "seen") return player.online ? -player.liveSessionMinutes * 60 : player.lastSeenSeconds
      if (sort.key === "playtime") return player.playtimeMinutes
      return 0
    }
    return [...searched].sort((a, b) =>
      sort.key === "name" ? a.name.localeCompare(b.name) * direction : (value(a) - value(b)) * direction,
    )
  }, [filter, online, players, byKey, deferredQuery, sort])

  const effectiveKey = selectedKey && byKey.has(selectedKey) ? selectedKey : desktop ? (visible[0]?.key ?? null) : null
  const selected = effectiveKey ? byKey.get(effectiveKey) : undefined

  function select(key: string) {
    setSelectedKey(key)
    if (!desktop) setSheetOpen(true)
  }

  const filters: [Filter, string, number][] = [
    ["online", "Online", counts.online],
    ["all", "All", counts.all],
    ["flagged", "Flagged", counts.flagged],
    ["banned", "Banned", counts.banned],
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 px-5 py-3">
        <h1 className="truncate text-sm font-semibold">Players</h1>
        <p className="mt-0.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
          {`${counts.online} online  ${counts.all} known  ${counts.flagged} flagged  ${counts.banned} banned`}
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col lg:border-r lg:border-border/70">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
            <div className="flex items-center gap-0.5 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Filter players">
              {filters.map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={filter === value}
                  tabIndex={filter === value ? 0 : -1}
                  onClick={() => setFilter(value)}
                  onKeyDown={handleRadioKeyDown}
                  className={cn(
                    "press h-7 rounded-lg px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filter === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  <span className="ml-1.5 font-mono text-[11px] tabular-nums opacity-70">{count}</span>
                </button>
              ))}
            </div>
            <label className="ml-auto flex h-8 w-full items-center gap-2 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground transition-colors focus-within:ring-2 focus-within:ring-ring sm:w-64">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} className="size-3.5 shrink-0" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setQuery("")
                }}
                placeholder="Name, server id or identifier"
                aria-label="Search players"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              {query ? <span className="font-mono text-[11px] tabular-nums">{visible.length}</span> : null}
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-6 pt-[12vh] text-center">
                <p className="text-xs wrap-anywhere text-muted-foreground">
                  {deferredQuery ? `No player matches “${query.trim()}”.` : filter === "online" ? "Nobody is online right now." : "No players in this list."}
                </p>
              </div>
            ) : (
              <PlayersTable players={visible} selectedKey={effectiveKey} onSelect={select} sort={sort} onSortChange={setSort} elapsed={elapsed} />
            )}
          </div>
        </div>

        {desktop ? (
          <aside aria-label="Player details" className="hidden w-[25rem] shrink-0 lg:block">
            {selected ? (
              <PlayerDetail player={selected} onSelect={select} />
            ) : (
              <div className="px-6 pt-[14vh] text-center text-xs text-muted-foreground">Pick a player to see their details.</div>
            )}
          </aside>
        ) : null}
      </div>

      {!desktop ? (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
            <SheetTitle className="sr-only">{selected?.name ?? "Player"}</SheetTitle>
            {selected ? <PlayerDetail player={selected} onSelect={select} /> : null}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}
