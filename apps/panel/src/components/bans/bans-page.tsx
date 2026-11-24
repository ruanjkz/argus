"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons"

import { usePlayers } from "@/components/players-store"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import type { BanRecord, BanStatus } from "@/lib/bans"
import { handleRadioKeyDown } from "@/lib/radio-group"
import { useIsDesktop } from "@/lib/use-is-desktop"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

import { BanDetail } from "./ban-detail"
import { NewBanDialog, RevokeDialog } from "./ban-dialogs"
import { expirySortValue } from "./ban-status"
import { BansTable, type BanSort } from "./bans-table"

type Filter = BanStatus | "all"

const WEEK_SECONDS = 7 * 86400

const EMPTY_TEXT: Record<Filter, string> = {
  active: t("Nobody is banned right now."),
  expired: t("No ban has run its full time yet."),
  revoked: t("No ban has been revoked."),
  all: t("No bans on record."),
}

export function BansPage() {
  const { banRecords } = usePlayers()
  const [filter, setFilter] = useState<Filter>("active")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<BanSort>({ key: "issued", direction: "desc" })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [revoking, setRevoking] = useState<BanRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const desktop = useIsDesktop()

  const counts = useMemo(() => {
    const active = banRecords.filter((record) => record.status === "active")
    return {
      active: active.length,
      expired: banRecords.filter((record) => record.status === "expired").length,
      revoked: banRecords.filter((record) => record.status === "revoked").length,
      all: banRecords.length,
      permanent: active.filter((record) => record.remainingSeconds === null).length,
      endingSoon: active.filter((record) => record.remainingSeconds !== null && record.remainingSeconds <= WEEK_SECONDS).length,
    }
  }, [banRecords])

  const visible = useMemo(() => {
    const base = filter === "all" ? banRecords : banRecords.filter((record) => record.status === filter)
    const searched = deferredQuery
      ? base.filter(
          (record) =>
            record.playerName.toLowerCase().includes(deferredQuery) ||
            record.reason.toLowerCase().includes(deferredQuery) ||
            record.actor.toLowerCase().includes(deferredQuery) ||
            record.id.toLowerCase().includes(deferredQuery) ||
            record.identifiers.some((identifier) => identifier.value.toLowerCase().includes(deferredQuery)),
        )
      : base
    const direction = sort.direction === "asc" ? 1 : -1
    return [...searched].sort((first, second) => {
      if (sort.key === "player") return first.playerName.localeCompare(second.playerName) * direction
      if (sort.key === "expires") return (expirySortValue(first) - expirySortValue(second)) * direction
      return (second.issuedSecondsAgo - first.issuedSecondsAgo) * direction
    })
  }, [banRecords, filter, deferredQuery, sort])

  const byId = useMemo(() => new Map(banRecords.map((record) => [record.entryId, record])), [banRecords])
  const effectiveId = selectedId && byId.has(selectedId) ? selectedId : desktop ? (visible[0]?.entryId ?? null) : null
  const selected = effectiveId ? byId.get(effectiveId) : undefined

  function select(entryId: string) {
    setSelectedId(entryId)
    if (!desktop) setSheetOpen(true)
  }

  const filters: [Filter, string, number][] = [
    ["active", "Active", counts.active],
    ["expired", "Expired", counts.expired],
    ["revoked", "Revoked", counts.revoked],
    ["all", "All", counts.all],
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{t("Bans")}</h1>
          <p className="mt-0.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
            {t(`${counts.active} active  ${counts.permanent} permanent  ${counts.endingSoon} end this week`)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} className="size-3.5" />
          {t("Ban by identifier")}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col lg:border-r lg:border-border/70">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
            <div className="flex items-center gap-0.5 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t("Filter bans")}>
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
                  {t(label)}
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
                placeholder={t("Player, reason, ban id or identifier")}
                aria-label={t("Search bans")}
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
                  {deferredQuery ? `No ban matches “${query.trim()}”.` : EMPTY_TEXT[filter]}
                </p>
              </div>
            ) : (
              <BansTable records={visible} selectedId={effectiveId} onSelect={select} sort={sort} onSortChange={setSort} />
            )}
          </div>
        </div>

        {desktop ? (
          <aside aria-label={t("Ban details")} className="hidden w-[25rem] shrink-0 lg:block">
            {selected ? (
              <BanDetail record={selected} onRevoke={setRevoking} />
            ) : (
              <div className="px-6 pt-[14vh] text-center text-xs text-muted-foreground">{t("Pick a ban to see its details.")}</div>
            )}
          </aside>
        ) : null}
      </div>

      {!desktop ? (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
            <SheetTitle className="sr-only">{selected ? `Ban on ${selected.playerName}` : "Ban"}</SheetTitle>
            {selected ? <BanDetail record={selected} onRevoke={setRevoking} /> : null}
          </SheetContent>
        </Sheet>
      ) : null}

      <RevokeDialog record={revoking} onClose={() => setRevoking(null)} />
      <NewBanDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
