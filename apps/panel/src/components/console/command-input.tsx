"use client"

import { useId, useRef, useState, type KeyboardEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { LockIcon } from "@hugeicons/core-free-icons"

import { canRun, REGISTERED_COMMANDS, type RegisteredCommand, type Role } from "@/lib/console-data"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

const MAX_SUGGESTIONS = 7
const MAX_HISTORY = 50

export function CommandInput({ onRun, role, blockedReason }: { onRun: (value: string) => void; role: Role; blockedReason?: string }) {
  const disabled = Boolean(blockedReason)
  const [value, setValue] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const token = value.trimStart()
  const typingName = token.length > 0 && !/\s/.test(token)
  const suggestions = typingName
    ? REGISTERED_COMMANDS.filter((command) => command.name.startsWith(token.toLowerCase())).slice(0, MAX_SUGGESTIONS)
    : []
  const exact = suggestions.length === 1 && suggestions[0].name === token
  const open = suggestions.length > 0 && !dismissed && !exact
  const active = open ? suggestions[Math.min(highlighted, suggestions.length - 1)] : undefined
  const lockedCount = REGISTERED_COMMANDS.filter((command) => !canRun(command, role)).length

  function update(next: string) {
    setValue(next)
    setDismissed(false)
    setHighlighted(0)
    setHistoryIndex(null)
  }

  function accept(command: RegisteredCommand) {
    setValue(command.args ? `${command.name} ` : command.name)
    setDismissed(true)
    inputRef.current?.focus()
  }

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onRun(trimmed)
    setHistory((previous) => [...previous.filter((entry) => entry !== trimmed), trimmed].slice(-MAX_HISTORY))
    setValue("")
    setHistoryIndex(null)
    setDismissed(false)
  }

  function recall(direction: -1 | 1) {
    if (!history.length) return
    const start = historyIndex ?? history.length
    const next = start + direction
    if (next < 0) return
    if (next >= history.length) {
      setHistoryIndex(null)
      setValue("")
      return
    }
    setHistoryIndex(next)
    setValue(history[next])
    setDismissed(true)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (open) setHighlighted((index) => (index + 1) % suggestions.length)
      else recall(1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      if (open) setHighlighted((index) => (index - 1 + suggestions.length) % suggestions.length)
      else recall(-1)
    } else if (event.key === "Tab" && open && active) {
      event.preventDefault()
      accept(active)
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (open && active && active.name !== token) accept(active)
      else submit()
    } else if (event.key === "Escape") {
      if (open) setDismissed(true)
      else update("")
    }
  }

  return (
    <div className="border-t border-border/70 px-3 pt-2.5 pb-2">
      <div className="relative">
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={t("Commands")}
            className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md rounded-xl border border-border/70 bg-popover p-1 shadow-lg shadow-black/5"
          >
            {suggestions.map((command, index) => {
              const allowed = canRun(command, role)
              return (
                <li
                  key={command.name}
                  id={`${listId}-${command.name}`}
                  role="option"
                  aria-selected={active?.name === command.name}
                  aria-disabled={!allowed}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    accept(command)
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5",
                    active?.name === command.name && "bg-muted",
                    !allowed && "text-muted-foreground",
                  )}
                >
                  <span className={cn("min-w-20 shrink-0 font-mono text-[12.5px]", allowed && "text-foreground")}>{command.name}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {command.args ? <span className="font-mono">{command.args}  </span> : null}
                    {command.description}
                  </span>
                  {allowed ? null : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <HugeiconsIcon icon={LockIcon} strokeWidth={1.75} className="size-3.5" />
                      {command.minRole} only
                    </span>
                  )}
                </li>
              )
            })}
            <li role="presentation" className="px-2.5 pt-1 pb-0.5 font-mono text-[11px] text-muted-foreground/70">
              from GetRegisteredCommands
            </li>
          </ul>
        ) : null}
        <label className="flex h-10 items-center gap-2.5 rounded-xl border border-border/70 px-3 transition-shadow focus-within:ring-2 focus-within:ring-focus/60 has-disabled:opacity-45">
          <span className="font-mono text-sm text-muted-foreground" aria-hidden>
            ›
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => update(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setDismissed(true)}
            disabled={disabled}
            role="combobox"
            aria-label={t("Run a command")}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open && active ? `${listId}-${active.name}` : undefined}
            aria-autocomplete="list"
            placeholder={blockedReason ?? t("Run a command")}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-foreground outline-none placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
        <span className="truncate">
          Signed in as <span className="text-foreground/80">{role}</span>
          {lockedCount ? `, ${lockedCount} commands need a higher role` : ""}
        </span>
        <span className="hidden shrink-0 font-mono whitespace-pre text-muted-foreground/70 sm:inline">{"Enter run  Tab complete  ↑ history"}</span>
      </div>
    </div>
  )
}
