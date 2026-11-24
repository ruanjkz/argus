"use client"

import { Fragment, useRef, type KeyboardEvent, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, AlertCircleIcon, ArrowDown01Icon, ArrowUp01Icon, RefreshIcon } from "@hugeicons/core-free-icons"

import { TextSwap } from "@/components/motion-primitives"
import type { ResourceView } from "@/components/resources-store"
import { formatCpu, formatMemory } from "@/lib/resources"
import { cn } from "@/lib/utils"

import { RESOURCE_STATUS, type FolderStats } from "./status"

export type ResourceSortKey = "name" | "cpu" | "memory"

export type ResourceSort = { key: ResourceSortKey; direction: "asc" | "desc" }

type Metric = "cpu" | "memory"

const SECONDARY_COLUMN = "hidden sm:table-cell lg:hidden xl:table-cell"

const COLUMN_LABEL: Record<ResourceSortKey, string> = { name: "Resource", cpu: "CPU", memory: "Memory" }

const METRICS: Metric[] = ["cpu", "memory"]

function metricValue(resource: ResourceView, metric: Metric) {
  return metric === "cpu" ? resource.liveCpuMs : resource.memoryKb
}

function formatMetric(value: number, metric: Metric) {
  return metric === "cpu" ? formatCpu(value) : formatMemory(value)
}

export function ResourcesTable({
  resources,
  grouped,
  folderStats,
  selectedName,
  serverOnline,
  onSelect,
  onEnsureFolder,
  sort,
  onSortChange,
}: {
  resources: ResourceView[]
  grouped: boolean
  folderStats: Map<string, FolderStats>
  selectedName: string | null
  serverOnline: boolean
  onSelect: (name: string) => void
  onEnsureFolder: (folder: string) => void
  sort: ResourceSort
  onSortChange: (sort: ResourceSort) => void
}) {
  const tableRef = useRef<HTMLTableElement>(null)
  const ranked = sort.key === "name" ? null : sort.key
  const primary: Metric = sort.key === "memory" ? "memory" : "cpu"
  const peak = ranked ? Math.max(0, ...resources.map((resource) => metricValue(resource, ranked))) : 0
  const columnClass = (metric: Metric) => (metric === primary ? "" : SECONDARY_COLUMN)

  function focusRow(index: number) {
    const resource = resources[index]
    if (!resource) return
    onSelect(resource.name)
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-resource-name="${resource.name}"]`)?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    if (!(event.target instanceof HTMLElement) || !event.target.closest("[data-resource-name]")) return
    event.preventDefault()
    const current = resources.findIndex((resource) => resource.name === selectedName)
    focusRow(event.key === "ArrowDown" ? Math.min(resources.length - 1, current + 1) : Math.max(0, current - 1))
  }

  return (
    <table ref={tableRef} onKeyDown={handleKeyDown} className="w-full text-xs">
      <thead className="sticky top-0 z-10 bg-background">
        <tr className="border-b border-border/70 text-muted-foreground">
          <SortHeader column="name" className="pr-2 pl-4" sort={sort} onSortChange={onSortChange} />
          <th scope="col" className="h-9 px-2 text-left font-normal">
            State
          </th>
          {METRICS.map((metric) => (
            <SortHeader key={metric} column={metric} align="right" className={cn("px-2", columnClass(metric))} sort={sort} onSortChange={onSortChange} />
          ))}
          <th scope="col" className="h-9 pr-4 pl-2 text-right font-normal">
            Issues
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {resources.map((resource, index) => {
          const selected = resource.name === selectedName
          const status = RESOURCE_STATUS[resource.status]
          const startsFolder = grouped && resources[index - 1]?.folder !== resource.folder
          const stats = startsFolder ? folderStats.get(resource.folder) : undefined
          return (
            <Fragment key={resource.name}>
              {stats ? (
                <tr className="bg-muted/40 font-mono text-[11px] text-muted-foreground">
                  <th scope="rowgroup" className="h-8 py-0 pr-2 pl-4 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <span className="truncate">{resource.folder}</span>
                      <button
                        type="button"
                        onClick={() => onEnsureFolder(resource.folder)}
                        disabled={!serverOnline}
                        aria-label={`Ensure every resource in ${resource.folder}`}
                        className="press inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 font-sans outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
                      >
                        <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} className="size-3" />
                        Ensure
                      </button>
                    </span>
                  </th>
                  <td className="px-2 whitespace-nowrap tabular-nums">{`${stats.started} of ${stats.total}`}</td>
                  {METRICS.map((metric) => (
                    <td key={metric} className={cn("px-2 text-right whitespace-nowrap tabular-nums", columnClass(metric))}>
                      {stats.started ? formatMetric(metric === "cpu" ? stats.cpuMs : stats.memoryKb, metric) : "—"}
                    </td>
                  ))}
                  <td />
                </tr>
              ) : null}
              <tr
                aria-selected={selected}
                onClick={() => onSelect(resource.name)}
                className={cn("cursor-default transition-colors hover:bg-muted/50", selected && "bg-muted hover:bg-muted")}
              >
                <td className="w-full max-w-0 py-2 pr-2 pl-4">
                  <button
                    type="button"
                    data-resource-name={resource.name}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(resource.name)
                    }}
                    tabIndex={selected || (!selectedName && index === 0) ? 0 : -1}
                    aria-current={selected ? "true" : undefined}
                    className="block w-full min-w-0 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className={cn("block truncate font-mono text-[13px]", resource.status === "stopped" ? "text-muted-foreground" : "text-foreground/90")}>
                      {resource.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {grouped ? resource.description : `${resource.folder}  ${resource.description}`}
                    </span>
                  </button>
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <span className={cn("inline-flex items-center gap-1.5", status.text)}>
                    <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} aria-hidden />
                    <TextSwap text={status.label} />
                  </span>
                </td>
                {METRICS.map((metric) => (
                  <MetricCell key={metric} className={columnClass(metric)} running={resource.status === "started"}>
                    {formatMetric(metricValue(resource, metric), metric)}
                    {ranked === metric ? <ShareBar value={metricValue(resource, metric)} peak={peak} /> : null}
                  </MetricCell>
                ))}
                <td className="py-2 pr-4 pl-2">
                  <span className="flex items-center justify-end gap-2.5 font-mono text-[11px] tabular-nums">
                    {resource.errors ? (
                      <span className="inline-flex items-center gap-1 text-destructive" title={`${resource.errors} script errors`}>
                        <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.75} className="size-3.5" />
                        {resource.errors}
                      </span>
                    ) : null}
                    {resource.warnings ? (
                      <span className="inline-flex items-center gap-1 text-warning" title={`${resource.warnings} slow ticks or hangs`}>
                        <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="size-3.5" />
                        {resource.warnings}
                      </span>
                    ) : null}
                    {!resource.errors && !resource.warnings ? <span className="text-muted-foreground/40">—</span> : null}
                  </span>
                </td>
              </tr>
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function MetricCell({ running, className, children }: { running: boolean; className: string; children: ReactNode }) {
  return (
    <td className={cn("px-2 py-2 text-right font-mono whitespace-nowrap text-foreground/80 tabular-nums", className)}>
      {running ? children : <span className="text-muted-foreground/50">—</span>}
    </td>
  )
}

function ShareBar({ value, peak }: { value: number; peak: number }) {
  const share = peak > 0 ? Math.max(value > 0 ? 3 : 0, (value / peak) * 100) : 0
  return (
    <span aria-hidden className="mt-1 ml-auto block h-0.5 w-16 overflow-hidden rounded-full bg-border">
      <span className="block h-full rounded-full bg-foreground/55" style={{ width: `${share}%` }} />
    </span>
  )
}

function SortHeader({
  column,
  align,
  className,
  sort,
  onSortChange,
}: {
  column: ResourceSortKey
  align?: "right"
  className: string
  sort: ResourceSort
  onSortChange: (sort: ResourceSort) => void
}) {
  const active = sort.key === column
  const firstDirection = column === "name" ? "asc" : "desc"
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("h-9 font-normal", className, align === "right" ? "text-right" : "text-left")}
    >
      <button
        type="button"
        onClick={() => onSortChange({ key: column, direction: active ? (sort.direction === "asc" ? "desc" : "asc") : firstDirection })}
        className={cn(
          "press inline-flex items-center gap-1 rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground",
        )}
      >
        {COLUMN_LABEL[column]}
        {active ? <HugeiconsIcon icon={sort.direction === "asc" ? ArrowUp01Icon : ArrowDown01Icon} strokeWidth={1.75} className="size-3" /> : null}
      </button>
    </th>
  )
}
