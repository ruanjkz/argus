"use client"

import { useRef, type KeyboardEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons"

import type { BanRecord } from "@/lib/bans"
import { formatAgo } from "@/lib/mock"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

import { BAN_STATUS, expiryLabel } from "./ban-status"

export type BanSortKey = "player" | "issued" | "expires"

export type BanSort = { key: BanSortKey; direction: "asc" | "desc" }

const SORT_LABELS: Record<BanSortKey, string> = { player: "Player", issued: "Issued", expires: "Expires" }

export function BansTable({
  records,
  selectedId,
  onSelect,
  sort,
  onSortChange,
}: {
  records: BanRecord[]
  selectedId: string | null
  onSelect: (entryId: string) => void
  sort: BanSort
  onSortChange: (sort: BanSort) => void
}) {
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  function focusRow(index: number) {
    const record = records[index]
    if (!record) return
    onSelect(record.entryId)
    bodyRef.current?.querySelector<HTMLButtonElement>(`[data-ban-id="${record.entryId}"]`)?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const current = records.findIndex((record) => record.entryId === selectedId)
    focusRow(event.key === "ArrowDown" ? Math.min(records.length - 1, current + 1) : Math.max(0, current - 1))
  }

  const header = (key: BanSortKey, className: string, align: "left" | "right") => {
    const active = sort.key === key
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
        className={cn("h-9 font-normal", className, align === "right" ? "text-right" : "text-left")}
      >
        <button
          type="button"
          onClick={() => onSortChange({ key, direction: active && sort.direction === "asc" ? "desc" : "asc" })}
          className={cn(
            "press inline-flex items-center gap-1 rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            active && "text-foreground",
          )}
        >
          {SORT_LABELS[key]}
          {active ? <HugeiconsIcon icon={sort.direction === "asc" ? ArrowUp01Icon : ArrowDown01Icon} strokeWidth={1.75} className="size-3" /> : null}
        </button>
      </th>
    )
  }

  return (
    <table className="w-full table-fixed text-xs">
      <colgroup>
        <col className="w-[38%] md:w-[26%]" />
        <col className="hidden md:table-column" />
        <col className="hidden w-24 sm:table-column lg:hidden xl:table-column" />
        <col className="w-20" />
        <col className="w-32" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-background">
        <tr className="border-b border-border/70 text-muted-foreground">
          {header("player", "pl-4 pr-2", "left")}
          <th scope="col" className="hidden h-9 px-2 text-left font-normal md:table-cell">
            {t("Reason")}
          </th>
          <th scope="col" className="hidden h-9 px-2 text-left font-normal sm:table-cell lg:hidden xl:table-cell">
            {t("By")}
          </th>
          {header("issued", "px-2", "right")}
          {header("expires", "pr-4 pl-2", "right")}
        </tr>
      </thead>
      <tbody ref={bodyRef} onKeyDown={handleKeyDown} className="divide-y divide-border/50">
        {records.map((record, index) => {
          const selected = record.entryId === selectedId
          const status = BAN_STATUS[record.status]
          return (
            <tr
              key={record.entryId}
              aria-selected={selected}
              onClick={() => onSelect(record.entryId)}
              className={cn("cursor-default transition-colors hover:bg-muted/50", selected && "bg-muted hover:bg-muted")}
            >
              <td className="py-2 pr-2 pl-4">
                <button
                  type="button"
                  data-ban-id={record.entryId}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(record.entryId)
                  }}
                  tabIndex={selected || (!selectedId && index === 0) ? 0 : -1}
                  aria-current={selected ? "true" : undefined}
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} aria-hidden />
                  <span className="min-w-0">
                    <span className={cn("block truncate text-[13px]", record.status === "active" ? "text-foreground/90" : "text-muted-foreground")}>
                      {record.playerName}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground tabular-nums">{record.id}</span>
                  </span>
                </button>
              </td>
              <td className="hidden truncate px-2 py-2 text-foreground/80 md:table-cell">{record.reason}</td>
              <td className="hidden truncate px-2 py-2 text-muted-foreground sm:table-cell lg:hidden xl:table-cell">{record.actor}</td>
              <td className="px-2 py-2 text-right font-mono whitespace-nowrap text-muted-foreground tabular-nums">{formatAgo(record.issuedSecondsAgo)}</td>
              <td
                className={cn(
                  "py-2 pr-4 pl-2 text-right font-mono whitespace-nowrap tabular-nums",
                  record.status === "active" ? "text-foreground/80" : "text-muted-foreground",
                )}
              >
                {expiryLabel(record)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
