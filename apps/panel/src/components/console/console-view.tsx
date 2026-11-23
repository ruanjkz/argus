"use client"

import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"

import { parseAnsi, type AnsiTone, type ConsoleKind, type ConsoleLine } from "@/lib/console-data"
import { cn } from "@/lib/utils"

const USER_INTENT_WINDOW = 400

const ROW_STYLES: Record<ConsoleKind, string> = {
  stdout: "text-foreground/85",
  stderr: "text-destructive",
  command: "bg-muted text-foreground",
  system: "text-foreground/85",
  warn: "text-warning",
}

const TAG_STYLES: Record<ConsoleKind, string> = {
  stdout: "text-muted-foreground",
  stderr: "text-destructive",
  command: "font-medium text-foreground",
  system: "text-info",
  warn: "text-warning",
}

const TONE_STYLES: Record<AnsiTone, string> = {
  black: "text-muted-foreground",
  red: "text-destructive",
  green: "text-success",
  yellow: "text-warning",
  blue: "text-focus",
  magenta: "text-[oklch(0.52_0.17_320)] dark:text-[oklch(0.78_0.12_320)]",
  cyan: "text-info",
  white: "text-foreground",
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  let index = lower.indexOf(needle)
  while (index !== -1) {
    if (index > cursor) parts.push(text.slice(cursor, index))
    parts.push(
      <mark key={index} className="rounded-sm bg-selection text-inherit ring-1 ring-focus/40">
        {text.slice(index, index + needle.length)}
      </mark>,
    )
    cursor = index + needle.length
    index = lower.indexOf(needle, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

function LineText({ text, query }: { text: string; query: string }) {
  return (
    <>
      {parseAnsi(text).map((segment, index) =>
        segment.tone || segment.bold ? (
          <span key={index} className={cn(segment.tone && TONE_STYLES[segment.tone], segment.bold && "font-semibold")}>
            {highlight(segment.text, query)}
          </span>
        ) : (
          <Fragment key={index}>{highlight(segment.text, query)}</Fragment>
        ),
      )}
    </>
  )
}

export function ConsoleView({
  lines,
  query,
  following,
  onFollowingChange,
  newCount,
  empty,
}: {
  lines: ConsoleLine[]
  query: string
  following: boolean
  onFollowingChange: (value: boolean) => void
  newCount: number
  empty: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const animatedId = useRef(lines[lines.length - 1]?.id ?? -1)
  const userIntentAt = useRef(0)

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 22,
    overscan: 24,
    getItemKey: (index) => lines[index].id,
  })

  const totalSize = virtualizer.getTotalSize()

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (following && element) element.scrollTop = element.scrollHeight
  }, [following, totalSize, lines.length])

  useEffect(() => {
    const newest = lines[lines.length - 1]
    if (!newest || newest.id <= animatedId.current) return
    animatedId.current = newest.id
    if (!following) return
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-line-id="${newest.id}"]`)
    if (!row) return
    row.classList.add("is-enter-start")
    void row.offsetHeight
    row.classList.remove("is-enter-start")
  }, [lines, following])

  function markIntent() {
    userIntentAt.current = performance.now()
  }

  function handleScroll() {
    const element = scrollRef.current
    if (!element) return
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40
    if (atBottom && !following) onFollowingChange(true)
    else if (!atBottom && following && performance.now() - userIntentAt.current < USER_INTENT_WINDOW) onFollowingChange(false)
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={markIntent}
        onTouchMove={markIntent}
        onPointerDown={markIntent}
        onKeyDown={markIntent}
        role="log"
        aria-label="Server console"
        aria-live="off"
        tabIndex={0}
        className="h-full overflow-y-auto py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">{empty}</div>
        ) : (
          <div className="relative w-full" style={{ height: totalSize }}>
            {virtualizer.getVirtualItems().map((item) => {
              const line = lines[item.index]
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full px-2"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <div
                    data-line-id={line.id}
                    className={cn(
                      "t-console-line grid grid-cols-[4.5rem_1fr] gap-x-3 rounded-md px-2 font-mono text-[12.5px] leading-[1.375rem] sm:grid-cols-[4.25rem_4.5rem_1fr]",
                      ROW_STYLES[line.kind],
                    )}
                  >
                    <span className="hidden text-muted-foreground/60 tabular-nums select-none sm:block">{line.time}</span>
                    <span className={cn("truncate", TAG_STYLES[line.kind])}>{line.tag ?? ""}</span>
                    <span className="min-w-0 break-words whitespace-pre-wrap">
                      <LineText text={line.text} query={query} />
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {!following && newCount > 0 ? (
        <button
          type="button"
          onClick={() => onFollowingChange(true)}
          className="t-dropdown press absolute inset-x-0 bottom-3 mx-auto inline-flex h-8 w-fit origin-bottom items-center gap-1.5 rounded-full border border-border/70 bg-popover px-3 text-xs text-foreground shadow-lg shadow-black/5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          data-state="open"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.75} className="size-3.5" />
          <span className="font-mono tabular-nums">{newCount}</span> new lines
        </button>
      ) : null}
    </div>
  )
}
