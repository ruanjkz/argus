"use client"

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Alert02Icon,
  Copy01Icon,
  Logout03Icon,
  Message01Icon,
  Note01Icon,
  Tick02Icon,
  UserBlock01Icon,
  UserCheck01Icon,
} from "@hugeicons/core-free-icons"

import { IconSwap } from "@/components/motion-primitives"
import { usePlayers, type PlayerView } from "@/components/players-store"
import { formatAgo } from "@/lib/mock"
import { formatPlaytime, initials, shortIdentifier, type HistoryType } from "@/lib/players"
import { cn } from "@/lib/utils"

import { ActionDialog, type PlayerAction } from "./action-dialog"

const ACTION_BUTTON =
  "press inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

const HISTORY_META: Record<HistoryType, { icon: IconSvgElement; verb: string; tone: string }> = {
  warn: { icon: Alert02Icon, verb: "warned", tone: "text-warning" },
  kick: { icon: Logout03Icon, verb: "kicked", tone: "text-foreground/80" },
  ban: { icon: UserBlock01Icon, verb: "banned", tone: "text-destructive" },
  unban: { icon: UserCheck01Icon, verb: "revoked the ban", tone: "text-success" },
  note: { icon: Note01Icon, verb: "added a note", tone: "text-muted-foreground" },
}

export function PlayerDetail({ player, onSelect }: { player: PlayerView; onSelect: (key: string) => void }) {
  const { byKey, elapsed, unban } = usePlayers()
  const [action, setAction] = useState<PlayerAction | null>(null)
  const status = player.banned
    ? { dot: "bg-destructive", text: `Banned  ${player.ban?.duration.toLowerCase()} by ${player.ban?.actor}`, tone: "text-destructive" }
    : player.online
      ? { dot: "bg-success", text: `Online  id ${player.serverId}  ${player.livePing} ms`, tone: "text-success" }
      : { dot: "bg-muted-foreground/50", text: `Offline  seen ${formatAgo(player.lastSeenSeconds + elapsed)}`, tone: "text-muted-foreground" }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted font-mono text-xs font-medium">{initials(player.name)}</span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{player.name}</h2>
            <p className={cn("mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[11px] whitespace-pre", status.tone)}>
              <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} />
              <span className="truncate">{status.text}</span>
            </p>
          </div>
        </div>
        <p className="mt-2.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
          {`first seen ${player.firstSeen}  ${player.sessions} sessions  ${formatPlaytime(player.playtimeMinutes)} played`}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setAction("message")} disabled={!player.online} className={cn(ACTION_BUTTON, "border border-border hover:bg-muted")}>
            <HugeiconsIcon icon={Message01Icon} strokeWidth={1.75} className="size-3.5" />
            Message
          </button>
          <button type="button" onClick={() => setAction("warn")} disabled={player.banned} className={cn(ACTION_BUTTON, "border border-border hover:bg-muted")}>
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="size-3.5" />
            Warn
          </button>
          <button type="button" onClick={() => setAction("kick")} disabled={!player.online} className={cn(ACTION_BUTTON, "border border-border hover:bg-muted")}>
            <HugeiconsIcon icon={Logout03Icon} strokeWidth={1.75} className="size-3.5" />
            Kick
          </button>
          {player.banned ? (
            <button type="button" onClick={() => unban(player.key)} className={cn(ACTION_BUTTON, "bg-muted text-foreground hover:bg-muted/70")}>
              <HugeiconsIcon icon={UserCheck01Icon} strokeWidth={1.75} className="size-3.5" />
              Revoke ban
            </button>
          ) : (
            <button type="button" onClick={() => setAction("ban")} className={cn(ACTION_BUTTON, "bg-destructive/10 text-destructive hover:bg-destructive/20")}>
              <HugeiconsIcon icon={UserBlock01Icon} strokeWidth={1.75} className="size-3.5" />
              Ban
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-6">
          {player.banned && player.ban ? (
            <div className="rounded-xl bg-destructive/10 px-3 py-2.5 text-xs">
              <p className="font-medium text-destructive">Banned for {player.ban.duration.toLowerCase()}</p>
              <p className="mt-1 wrap-break-word text-foreground/90">{player.ban.reason}</p>
              <p className="mt-1.5 font-mono text-[11px] whitespace-pre text-muted-foreground">
                {`by ${player.ban.actor}  ${formatAgo(Math.max(0, player.ban.secondsAgo + elapsed))}`}
              </p>
            </div>
          ) : null}

          <Section title="Identifiers" meta={`${player.identifiers.length} ids  ${player.tokens} hardware tokens`}>
            <ul className="flex flex-col">
              {player.identifiers.map((identifier) => (
                <li key={identifier.value} className="group flex h-8 items-center gap-3 rounded-lg px-2 hover:bg-muted/60">
                  <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{identifier.kind}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/90">{shortIdentifier(identifier.value)}</span>
                  <CopyButton value={identifier.value} label={`Copy ${identifier.kind}`} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Linked accounts" meta={`${player.linked.length} found`}>
            {player.linked.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">No other account shares an identifier or token.</p>
            ) : (
              <ul className="flex flex-col">
                {player.linked.map((link) => {
                  const other = byKey.get(link.key)
                  if (!other) return null
                  return (
                    <li key={link.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(other.key)}
                        className="flex min-h-9 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/60 active:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            other.banned ? "bg-destructive" : other.online ? "bg-success" : "bg-muted-foreground/40",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-foreground/90">{other.name}</span>
                          <span className="block truncate font-mono text-[11px] whitespace-pre text-muted-foreground">{link.reasons.join("  ")}</span>
                        </span>
                        {other.banned ? <span className="rounded-md bg-destructive/10 px-1.5 text-[11px] leading-5 text-destructive">banned</span> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section title="History" meta={`${player.history.length} entries`}>
            {player.history.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">No warnings, kicks, bans or notes yet.</p>
            ) : (
              <ol className="flex flex-col gap-0.5">
                {player.history.map((entry) => {
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
            )}
            <NoteForm playerKey={player.key} />
          </Section>
        </div>
      </div>

      <ActionDialog action={action} player={player} onClose={() => setAction(null)} />
    </div>
  )
}

function Section({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 px-2">
        <h3 className="text-xs font-medium">{title}</h3>
        {meta ? <span className="font-mono text-[11px] whitespace-pre text-muted-foreground">{meta}</span> : null}
      </div>
      {children}
    </section>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
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

function NoteForm({ playerKey }: { playerKey: string }) {
  const { note } = usePlayers()
  const [text, setText] = useState("")

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    note(playerKey, value)
    setText("")
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-1.5 px-2">
      <label htmlFor={`note-${playerKey}`} className="sr-only">
        Add a note
      </label>
      <input
        id={`note-${playerKey}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Add a note for staff"
        className="h-8 min-w-0 flex-1 rounded-lg bg-muted px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="press h-8 rounded-lg px-2.5 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
      >
        Add
      </button>
    </form>
  )
}
