"use client"

import { useState, type FormEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Logout03Icon, Message01Icon, UserBlock01Icon, UserCheck01Icon } from "@hugeicons/core-free-icons"

import { ACTION_BUTTON, HistoryList, IdentifierList, Section } from "@/components/detail-parts"
import { usePlayers, type PlayerView } from "@/components/players-store"
import { formatAgo } from "@/lib/mock"
import { formatPlaytime, initials } from "@/lib/players"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

import { ActionDialog, type PlayerAction } from "./action-dialog"

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
            {t("Message")}
          </button>
          <button type="button" onClick={() => setAction("warn")} disabled={player.banned} className={cn(ACTION_BUTTON, "border border-border hover:bg-muted")}>
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="size-3.5" />
            {t("Warn")}
          </button>
          <button type="button" onClick={() => setAction("kick")} disabled={!player.online} className={cn(ACTION_BUTTON, "border border-border hover:bg-muted")}>
            <HugeiconsIcon icon={Logout03Icon} strokeWidth={1.75} className="size-3.5" />
            {t("Kick")}
          </button>
          {player.banned ? (
            <button type="button" onClick={() => unban(player.key)} className={cn(ACTION_BUTTON, "bg-muted text-foreground hover:bg-muted/70")}>
              <HugeiconsIcon icon={UserCheck01Icon} strokeWidth={1.75} className="size-3.5" />
              {t("Revoke ban")}
            </button>
          ) : (
            <button type="button" onClick={() => setAction("ban")} className={cn(ACTION_BUTTON, "bg-destructive/10 text-destructive hover:bg-destructive/20")}>
              <HugeiconsIcon icon={UserBlock01Icon} strokeWidth={1.75} className="size-3.5" />
              {t("Ban")}
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

          <Section title={t("Identifiers")} meta={`${player.identifiers.length} ids  ${player.tokens} hardware tokens`}>
            <IdentifierList identifiers={player.identifiers} />
          </Section>

          <Section title={t("Linked accounts")} meta={`${player.linked.length} found`}>
            {player.linked.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">{t("No other account shares an identifier or token.")}</p>
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

          <Section title={t("History")} meta={`${player.history.length} entries`}>
            <HistoryList entries={player.history} elapsed={elapsed} empty={t("No warnings, kicks, bans or notes yet.")} />
            <NoteForm playerKey={player.key} />
          </Section>
        </div>
      </div>

      <ActionDialog action={action} player={player} onClose={() => setAction(null)} />
    </div>
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
        {t("Add a note")}
      </label>
      <input
        id={`note-${playerKey}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("Add a note for staff")}
        className="h-8 min-w-0 flex-1 rounded-lg bg-muted px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="press h-8 rounded-lg px-2.5 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
      >
        {t("Add")}
      </button>
    </form>
  )
}
