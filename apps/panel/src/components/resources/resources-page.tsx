"use client"

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, RefreshIcon, Search01Icon } from "@hugeicons/core-free-icons"

import { useConsole } from "@/components/console-store"
import { STATUS_META, useLiveServer } from "@/components/live-server"
import { IconSwap } from "@/components/motion-primitives"
import { useResources, type ResourceView } from "@/components/resources-store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { handleRadioKeyDown } from "@/lib/radio-group"
import { useIsDesktop } from "@/lib/use-is-desktop"
import { cn } from "@/lib/utils"

import { ResourceDetail } from "./resource-detail"
import { ResourcesTable, type ResourceSort, type ResourceSortKey } from "./resources-table"
import { folderStatsOf, hasProblems } from "./status"

type Filter = "all" | "started" | "stopped" | "problems"

const ORDERS: [ResourceSortKey, string][] = [
  ["name", "Folders"],
  ["cpu", "Top CPU"],
  ["memory", "Top memory"],
]

const REFRESH_MS = 700

export function ResourcesPage() {
  const { resources, byName, serverOnline } = useResources()
  const consoleStore = useConsole()
  const live = useLiveServer()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<ResourceSort>({ key: "name", direction: "asc" })
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [ensuring, setEnsuring] = useState<string | null>(null)
  const refreshTimer = useRef<number | null>(null)
  const folderStats = useMemo(() => folderStatsOf(resources), [resources])
  const ensuringStats = ensuring ? folderStats.get(ensuring) : undefined
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const desktop = useIsDesktop()

  useEffect(() => () => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
  }, [])

  const counts = useMemo(
    () => ({
      all: resources.length,
      started: resources.filter((resource) => resource.status === "started").length,
      stopped: resources.filter((resource) => resource.status === "stopped").length,
      problems: resources.filter(hasProblems).length,
    }),
    [resources],
  )

  const grouped = sort.key === "name" && sort.direction === "asc" && !deferredQuery

  const visible = useMemo(() => {
    const base =
      filter === "started"
        ? resources.filter((resource) => resource.status === "started")
        : filter === "stopped"
          ? resources.filter((resource) => resource.status === "stopped")
          : filter === "problems"
            ? resources.filter(hasProblems)
            : resources
    const searched = deferredQuery
      ? base.filter(
          (resource) =>
            resource.name.toLowerCase().includes(deferredQuery) ||
            resource.folder.toLowerCase().includes(deferredQuery) ||
            resource.description.toLowerCase().includes(deferredQuery),
        )
      : base
    if (grouped) return searched
    const direction = sort.direction === "asc" ? 1 : -1
    const value = (resource: ResourceView) => (sort.key === "cpu" ? resource.liveCpuMs : resource.memoryKb)
    return [...searched].sort((a, b) =>
      sort.key === "name" ? a.name.localeCompare(b.name) * direction : (value(a) - value(b)) * direction || a.name.localeCompare(b.name),
    )
  }, [filter, resources, deferredQuery, sort, grouped])

  const effectiveName = selectedName && byName.has(selectedName) ? selectedName : desktop ? (visible[0]?.name ?? null) : null
  const selected = effectiveName ? byName.get(effectiveName) : undefined

  function select(name: string) {
    setSelectedName(name)
    if (!desktop) setSheetOpen(true)
  }

  function ensureFolder(folder: string) {
    consoleStore.run(`ensure ${folder}`)
    live.logAction(`ran ensure ${folder}`)
  }

  function requestEnsure(folder: string) {
    if (folderStats.get(folder)?.started) setEnsuring(folder)
    else ensureFolder(folder)
  }

  function refresh() {
    if (refreshing || !serverOnline) return
    consoleStore.run("refresh")
    setRefreshing(true)
    refreshTimer.current = window.setTimeout(() => setRefreshing(false), REFRESH_MS)
  }

  const filters: [Filter, string, number][] = [
    ["all", "All", counts.all],
    ["started", "Started", counts.started],
    ["stopped", "Stopped", counts.stopped],
    ["problems", "Problems", counts.problems],
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 px-5 py-3">
        <h1 className="truncate text-sm font-semibold">Resources</h1>
        <p className="mt-0.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
          {`${counts.all} resources  ${counts.started} started  ${counts.stopped} stopped  ${counts.problems} with problems`}
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col lg:border-r lg:border-border/70">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
            <div className="flex items-center gap-0.5 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Filter resources">
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
            <div className="flex items-center gap-0.5 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Order resources">
              {ORDERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={sort.key === key}
                  tabIndex={sort.key === key ? 0 : -1}
                  onClick={() => setSort({ key, direction: key === "name" ? "asc" : "desc" })}
                  onKeyDown={handleRadioKeyDown}
                  className={cn(
                    "press h-7 rounded-lg px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    sort.key === key ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
              <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground transition-colors focus-within:ring-2 focus-within:ring-ring sm:w-56 sm:flex-none">
                <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} className="size-3.5 shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setQuery("")
                  }}
                  placeholder="Name or folder"
                  aria-label="Search resources"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
                {query ? <span className="font-mono text-[11px] tabular-nums">{visible.length}</span> : null}
              </label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={!serverOnline}
                    aria-label="Rescan the resources folder"
                    className="press grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
                  >
                    <IconSwap
                      active={refreshing ? "b" : "a"}
                      first={<HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} className="size-4" />}
                      second={
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          strokeWidth={1.75}
                          className={cn("size-4", refreshing && "animate-spin motion-reduce:animate-none")}
                        />
                      }
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Rescan the resources folder</TooltipContent>
              </Tooltip>
            </div>
          </div>
          {serverOnline ? null : (
            <p className="border-b border-border/70 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
              The server is {STATUS_META[live.status].label.toLowerCase()}. Resources start again when it is online.
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="px-6 pt-[12vh] text-center">
                <p className="text-xs wrap-anywhere text-muted-foreground">
                  {deferredQuery ? `No resource matches “${query.trim()}”.` : "No resources in this list."}
                </p>
              </div>
            ) : (
              <ResourcesTable
                resources={visible}
                grouped={grouped}
                folderStats={folderStats}
                selectedName={effectiveName}
                serverOnline={serverOnline}
                onSelect={select}
                onEnsureFolder={requestEnsure}
                sort={sort}
                onSortChange={setSort}
              />
            )}
          </div>
        </div>

        {desktop ? (
          <aside aria-label="Resource details" className="hidden w-[25rem] shrink-0 lg:block">
            {selected ? (
              <ResourceDetail resource={selected} onSelect={select} onEnsureFolder={requestEnsure} />
            ) : (
              <div className="px-6 pt-[14vh] text-center text-xs text-muted-foreground">Pick a resource to see its details.</div>
            )}
          </aside>
        ) : null}
      </div>

      {!desktop ? (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
            <SheetTitle className="sr-only">{selected?.name ?? "Resource"}</SheetTitle>
            {selected ? <ResourceDetail resource={selected} onSelect={select} onEnsureFolder={requestEnsure} /> : null}
          </SheetContent>
        </Sheet>
      ) : null}

      <Dialog open={ensuring !== null} onOpenChange={(open) => !open && setEnsuring(null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold wrap-anywhere">Ensure {ensuring}?</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {ensuringStats
                ? `Restarts the ${ensuringStats.started} running ${ensuringStats.started === 1 ? "resource" : "resources"} in this folder ${ensuringStats.total - ensuringStats.started ? `and starts the ${ensuringStats.total - ensuringStats.started} stopped` : "in place"}. Scripts lose what they keep in memory.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" autoFocus className="h-8 rounded-lg px-3">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (ensuring) ensureFolder(ensuring)
                setEnsuring(null)
              }}
              className="h-8 rounded-lg px-3"
            >
              Ensure folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
