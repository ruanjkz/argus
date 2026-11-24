"use client"

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, Download04Icon, FilterIcon, PauseIcon, PlayIcon, Search01Icon } from "@hugeicons/core-free-icons"

import { useConsole } from "@/components/console-store"
import { STATUS_META, useLiveServer } from "@/components/live-server"
import { StatusBadge } from "@/components/status-badge"
import { IconSwap, TextSwap } from "@/components/motion-primitives"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { stripAnsi, type ConsoleKind, type ConsoleLine } from "@/lib/console-data"
import { handleRadioKeyDown } from "@/lib/radio-group"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

import { CommandInput } from "./command-input"
import { ConsoleView } from "./console-view"

type LevelFilter = "all" | "errors" | "warnings" | "commands"

const LEVEL_KINDS: Record<Exclude<LevelFilter, "all">, ConsoleKind> = {
  errors: "stderr",
  warnings: "warn",
  commands: "command",
}

const ICON_BUTTON =
  "press grid size-8 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

function downloadLog(lines: ConsoleLine[]) {
  const text = lines.map((line) => `${line.time}  ${(line.tag ?? "").padEnd(8)}  ${stripAnsi(line.text)}`).join("\n")
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `console-${new Date().toISOString().slice(0, 10)}.log`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ConsolePage() {
  const { lines, run, clear, role } = useConsole()
  const { status, serverName, pid } = useLiveServer()
  const [level, setLevel] = useState<LevelFilter>("all")
  const [hiddenSources, setHiddenSources] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [following, setFollowing] = useState(true)
  const [pausedAfterId, setPausedAfterId] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query.trim())

  const counts = useMemo(() => {
    const result = { stderr: 0, warn: 0, command: 0 }
    for (const line of lines) {
      if (line.kind === "stderr" || line.kind === "warn" || line.kind === "command") result[line.kind] += 1
    }
    return result
  }, [lines])

  const sources = useMemo(() => {
    const totals = new Map<string, number>()
    for (const line of lines) totals.set(line.source, (totals.get(line.source) ?? 0) + 1)
    return [...totals.entries()].sort((a, b) => b[1] - a[1])
  }, [lines])

  const filtered = useMemo(() => {
    const needle = deferredQuery.toLowerCase()
    return lines.filter((line) => {
      if (level !== "all" && line.kind !== LEVEL_KINDS[level]) return false
      if (hiddenSources.includes(line.source)) return false
      if (needle && !stripAnsi(line.text).toLowerCase().includes(needle) && !(line.tag ?? "").toLowerCase().includes(needle)) return false
      return true
    })
  }, [lines, level, hiddenSources, deferredQuery])

  const newCount = useMemo(() => {
    if (following) return 0
    let count = 0
    for (let index = filtered.length - 1; index >= 0 && filtered[index].id > pausedAfterId; index--) count += 1
    return count
  }, [filtered, following, pausedAfterId])
  const filtersActive = level !== "all" || hiddenSources.length > 0 || deferredQuery.length > 0

  function changeFollowing(value: boolean) {
    setFollowing(value)
    if (!value) setPausedAfterId(lines[lines.length - 1]?.id ?? -1)
  }

  function resetFilters() {
    setLevel("all")
    setHiddenSources([])
    setQuery("")
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  const levels: [LevelFilter, string, number | null][] = [
    ["all", "All", null],
    ["errors", "Errors", counts.stderr],
    ["warnings", "Warnings", counts.warn],
    ["commands", "Commands", counts.command],
  ]

  const inputBlockedReason =
    status === "online" ? undefined : status === "offline" ? t("Server is offline") : t(`Server is ${STATUS_META[status].label.toLowerCase()}`)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{t("Console")}</h1>
          <p className="mt-0.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
            {`${serverName}  pid ${pid ?? "—"}  ${lines.length.toLocaleString("en-US")} lines  showing ${filtered.length.toLocaleString("en-US")}`}
          </p>
        </div>
        <StatusBadge status={status} />
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-0.5 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t("Level")}>
          {levels.map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={level === value}
              tabIndex={level === value ? 0 : -1}
              onClick={() => setLevel(value)}
              onKeyDown={handleRadioKeyDown}
              className={cn(
                "press h-7 rounded-lg px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                level === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(label)}
              {count !== null ? <span className="ml-1.5 font-mono text-[11px] tabular-nums opacity-70">{count}</span> : null}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted aria-expanded:text-foreground"
            >
              <HugeiconsIcon icon={FilterIcon} strokeWidth={1.75} className="size-3.5" />
              {t("Sources")}
              {hiddenSources.length ? (
                <span className="rounded-md bg-warning/12 px-1.5 font-mono text-[11px] leading-5 text-warning">{t("{count} hidden", { count: hiddenSources.length })}</span>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-60 rounded-xl">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">{t("Show lines from")}</DropdownMenuLabel>
            {sources.map(([source, total]) => (
              <DropdownMenuCheckboxItem
                key={source}
                checked={!hiddenSources.includes(source)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  setHiddenSources((previous) => (checked ? previous.filter((entry) => entry !== source) : [...previous, source]))
                }
              >
                <span className="flex-1 truncate font-mono">{source}</span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{total}</span>
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!hiddenSources.length} onSelect={() => setHiddenSources([])}>
              {t("Show all sources")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1">
          <label className="flex h-8 w-44 items-center gap-2 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground transition-colors focus-within:ring-2 focus-within:ring-ring sm:w-56">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} className="size-3.5 shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("")
                  event.currentTarget.blur()
                }
              }}
              placeholder={t("Search output")}
              aria-label={t("Search console output")}
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <span className="font-mono text-[11px] tabular-nums">{filtered.length}</span>
            ) : (
              <Kbd className="h-5 rounded-md text-[10px]">Ctrl F</Kbd>
            )}
          </label>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => changeFollowing(!following)}
                aria-pressed={!following}
                aria-label={following ? t("Pause auto scroll") : t("Follow new lines")}
                className={cn(ICON_BUTTON, "flex h-8 w-auto gap-1.5 px-2.5 text-xs", !following && "bg-muted text-foreground")}
              >
                <IconSwap
                  active={following ? "a" : "b"}
                  first={<HugeiconsIcon icon={PauseIcon} strokeWidth={1.75} className="size-3.5" />}
                  second={<HugeiconsIcon icon={PlayIcon} strokeWidth={1.75} className="size-3.5" />}
                />
                <span className="inline-grid">
                  <span aria-hidden className="invisible col-start-1 row-start-1">
                    {t("Follow")}
                  </span>
                  <TextSwap text={following ? "Pause" : "Follow"} className="col-start-1 row-start-1" />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{following ? "Stop auto scroll" : t("Jump to the newest line")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={clear} disabled={!lines.length} aria-label={t("Clear view")} className={ICON_BUTTON}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("Clear view")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => downloadLog(lines)} disabled={!lines.length} aria-label={t("Download log")} className={ICON_BUTTON}>
                <HugeiconsIcon icon={Download04Icon} strokeWidth={1.75} className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("Download log")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ConsoleView
        lines={filtered}
        query={deferredQuery}
        following={following}
        onFollowingChange={changeFollowing}
        newCount={newCount}
        empty={
          lines.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("View cleared. New lines will show up here.")}</p>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground">{t("No lines match these filters.")}</p>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="press mt-3 inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )
        }
      />

      <CommandInput onRun={run} role={role} blockedReason={inputBlockedReason} />
    </div>
  )
}
