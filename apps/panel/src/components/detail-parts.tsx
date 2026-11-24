"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Alert02Icon,
  Copy01Icon,
  Logout03Icon,
  Note01Icon,
  Tick02Icon,
  UserBlock01Icon,
  UserCheck01Icon,
} from "@hugeicons/core-free-icons"

import { IconSwap } from "@/components/motion-primitives"
import { formatAgo } from "@/lib/mock"
import { shortIdentifier, type HistoryEntry, type HistoryType, type Identifier } from "@/lib/players"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

const HISTORY_META: Record<HistoryType, { icon: IconSvgElement; verb: string; tone: string }> = {
  warn: { icon: Alert02Icon, verb: "warned", tone: "text-warning" },
  kick: { icon: Logout03Icon, verb: "kicked", tone: "text-foreground/80" },
  ban: { icon: UserBlock01Icon, verb: "banned", tone: "text-destructive" },
  unban: { icon: UserCheck01Icon, verb: "revoked the ban", tone: "text-success" },
  note: { icon: Note01Icon, verb: "added a note", tone: "text-muted-foreground" },
}

export function HistoryList({ entries, elapsed, empty }: { entries: HistoryEntry[]; elapsed: number; empty: string }) {
  if (entries.length === 0) return <p className="px-2 text-xs text-muted-foreground">{empty}</p>
  return (
    <ol className="flex flex-col gap-0.5">
      {entries.map((entry) => {
        const meta = HISTORY_META[entry.type]
        return (
          <li key={entry.id} className="flex gap-3 rounded-lg px-2 py-2">
            <HugeiconsIcon icon={meta.icon} strokeWidth={1.75} className={cn("mt-0.5 size-4 shrink-0", meta.tone)} />
            <div className="min-w-0 flex-1 text-xs">
              <p>
                <span className="font-medium text-foreground/90">{entry.actor}</span>{" "}
                <span className="text-muted-foreground">
                  {meta.verb}
                  {entry.duration ? ` for ${entry.duration.toLowerCase()}` : ""}
                </span>
              </p>
              <p className="mt-0.5 wrap-break-word text-foreground/85">{entry.reason}</p>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatAgo(Math.max(0, entry.secondsAgo + elapsed))}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export const ACTION_BUTTON =
  "press inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

export function Section({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section aria-label={t(title)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 px-2">
        <h3 className="text-xs font-medium">{t(title)}</h3>
        {meta ? <span className="font-mono text-[11px] whitespace-pre text-muted-foreground">{t(meta)}</span> : null}
      </div>
      {children}
    </section>
  )
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      data-copied={copied ? "true" : undefined}
      className="press grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-[copied=true]:opacity-100"
    >
      <IconSwap
        active={copied ? "b" : "a"}
        first={<HugeiconsIcon icon={Copy01Icon} strokeWidth={1.75} className="size-3.5" />}
        second={<HugeiconsIcon icon={Tick02Icon} strokeWidth={1.75} className="size-3.5 text-success" />}
      />
    </button>
  )
}

export function IdentifierList({ identifiers }: { identifiers: Identifier[] }) {
  return (
    <ul className="flex flex-col">
      {identifiers.map((identifier) => (
        <li key={identifier.value} className="group flex h-8 items-center gap-3 rounded-lg px-2 hover:bg-muted/60">
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{identifier.kind}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/90">{shortIdentifier(identifier.value)}</span>
          <CopyButton value={identifier.value} label={`Copy ${identifier.kind}`} />
        </li>
      ))}
    </ul>
  )
}

export function DetailRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-2 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{t(label)}</dt>
          <dd className="min-w-0 truncate text-right font-mono text-[12px] text-foreground/90 tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
