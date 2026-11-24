"use client"

import { Fragment, useRef, type KeyboardEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, AlertCircleIcon, ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons"

import { TextSwap } from "@/components/motion-primitives"
import type { ResourceView } from "@/components/resources-store"
import { formatCpu, formatMemory } from "@/lib/resources"
import { cn } from "@/lib/utils"

import { RESOURCE_STATUS } from "./status"

export type ResourceSortKey = "name" | "cpu" | "memory"

export type ResourceSort = { key: ResourceSortKey; direction: "asc" | "desc" }

const COLUMNS: { key: ResourceSortKey; label: string; className: string; align?: "right" }[] = [
  { key: "name", label: "Resource", className: "pl-4 pr-2" },
  { key: "cpu", label: "CPU", className: "px-2", align: "right" },
  { key: "memory", label: "Memory", className: "hidden px-2 sm:table-cell lg:hidden xl:table-cell", align: "right" },
]

export function ResourcesTable({
  resources,
  grouped,
  selectedName,
  onSelect,
  sort,
  onSortChange,
}: {
  resources: ResourceView[]
  grouped: boolean
  selectedName: string | null
  onSelect: (name: string) => void
  sort: ResourceSort
  onSortChange: (sort: ResourceSort) => void
}) {
  const tableRef = useRef<HTMLTableElement>(null)

  function focusRow(index: number) {
    const resource = resources[index]
    if (!resource) return
    onSelect(resource.name)
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-resource-name="${resource.name}"]`)?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    if (!(event.target instanceof HTMLElement) || !event.target.closest("tbody")) return
    event.preventDefault()
    const current = resources.findIndex((resource) => resource.name === selectedName)
    focusRow(event.key === "ArrowDown" ? Math.min(resources.length - 1, current + 1) : Math.max(0, current - 1))
  }

  const folderSizes = new Map<string, number>()
  for (const resource of resources) folderSizes.set(resource.folder, (folderSizes.get(resource.folder) ?? 0) + 1)

  return (
    <table ref={tableRef} onKeyDown={handleKeyDown} className="w-full text-xs">
      <thead className="sticky top-0 z-10 bg-background">
        <tr className="border-b border-border/70 text-muted-foreground">
          {COLUMNS.slice(0, 1).map((column) => (
            <SortHeader key={column.key} column={column} sort={sort} onSortChange={onSortChange} />
          ))}
          <th scope="col" className="h-9 px-2 text-left font-normal">
            State
          </th>
          {COLUMNS.slice(1).map((column) => (
            <SortHeader key={column.key} column={column} sort={sort} onSortChange={onSortChange} />
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
          return (
            <Fragment key={resource.name}>
              {startsFolder ? (
                <tr className="bg-muted/40">
                  <th scope="colgroup" colSpan={5} className="h-7 px-4 text-left font-mono text-[11px] font-normal whitespace-pre text-muted-foreground">
                    {`${resource.folder}  ${folderSizes.get(resource.folder) ?? 0}`}
                  </th>
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
                    <span className="block truncate text-[11px] text-muted-foreground">{resource.description}</span>
                  </button>
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <span className={cn("inline-flex items-center gap-1.5", status.text)}>
                    <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} aria-hidden />
                    <TextSwap text={status.label} />
                  </span>
                </td>
                <td className="px-2 py-2 text-right font-mono whitespace-nowrap text-foreground/80 tabular-nums">
                  {resource.status === "started" ? formatCpu(resource.liveCpuMs) : <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="hidden px-2 py-2 text-right font-mono whitespace-nowrap text-foreground/80 tabular-nums sm:table-cell lg:hidden xl:table-cell">
                  {resource.status === "started" ? formatMemory(resource.memoryKb) : <span className="text-muted-foreground/50">—</span>}
                </td>
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

function SortHeader({
  column,
  sort,
  onSortChange,
}: {
  column: (typeof COLUMNS)[number]
  sort: ResourceSort
  onSortChange: (sort: ResourceSort) => void
}) {
  const active = sort.key === column.key
  return (
    <th
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
        {active ? <HugeiconsIcon icon={sort.direction === "asc" ? ArrowUp01Icon : ArrowDown01Icon} strokeWidth={1.75} className="size-3" /> : null}
      </button>
    </th>
  )
}
