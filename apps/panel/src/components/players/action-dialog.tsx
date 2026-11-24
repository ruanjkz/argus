"use client"

import { useState, type FormEvent } from "react"

import type { PlayerView } from "@/components/players-store"
import { usePlayers } from "@/components/players-store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BAN_DURATIONS } from "@/lib/bans"
import { handleRadioKeyDown } from "@/lib/radio-group"
import { useFieldError } from "@/lib/use-field-error"
import { cn } from "@/lib/utils"

export type PlayerAction = "warn" | "kick" | "ban" | "message"

const TEMPLATES: Record<PlayerAction, string[]> = {
  warn: ["Spawn camping", "Team killing", "Toxic chat", "Ignoring staff"],
  kick: ["AFK", "Ignoring staff", "Desync, rejoin please"],
  ban: ["Cheating", "Ban evasion", "Toxic chat after warnings", "Exploiting"],
  message: ["Please check the rules channel", "Join the staff voice channel"],
}

const COPY: Record<PlayerAction, { title: string; description: (player: PlayerView) => string; confirm: string; field: string }> = {
  warn: {
    title: "Warn",
    description: (player) => `${player.name} sees this on screen and it stays in their history.`,
    confirm: "Send warning",
    field: "Reason",
  },
  kick: {
    title: "Kick",
    description: (player) => `${player.name} is disconnected and sees the reason. They can rejoin right away.`,
    confirm: "Kick player",
    field: "Reason",
  },
  ban: {
    title: "Ban",
    description: (player) => `${player.name} is disconnected and blocked by every identifier and hardware token on record.`,
    confirm: "Ban player",
    field: "Reason",
  },
  message: {
    title: "Message",
    description: (player) => `Shows a private message on ${player.name}'s screen.`,
    confirm: "Send message",
    field: "Message",
  },
}

export function ActionDialog({
  action,
  player,
  onClose,
}: {
  action: PlayerAction | null
  player: PlayerView
  onClose: () => void
}) {
  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="rounded-2xl p-5 sm:max-w-md">
        {action ? <ActionForm key={`${action}-${player.key}`} action={action} player={player} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ActionForm({ action, player, onClose }: { action: PlayerAction; player: PlayerView; onClose: () => void }) {
  const store = usePlayers()
  const [reason, setReason] = useState("")
  const [duration, setDuration] = useState("7 days")
  const unbannedLinks = player.linked.map((link) => store.byKey.get(link.key)).filter((entry): entry is PlayerView => Boolean(entry && !entry.banned))
  const [includeLinked, setIncludeLinked] = useState(unbannedLinks.length > 0)
  const { wrapRef, fieldRef, show: showError, clear: clearError } = useFieldError<HTMLTextAreaElement>()
  const copy = COPY[action]

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = reason.trim()
    if (!text) {
      showError()
      return
    }
    if (action === "warn") store.warn(player.key, text)
    if (action === "kick") store.kick(player.key, text)
    if (action === "ban") store.ban(player.key, text, duration, includeLinked)
    if (action === "message") store.message(player.key, text)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-sm font-semibold wrap-anywhere">
          {copy.title} {player.name}
        </DialogTitle>
        <DialogDescription className="text-xs wrap-anywhere text-muted-foreground">{copy.description(player)}</DialogDescription>
      </DialogHeader>

      <div ref={wrapRef} className="t-input-wrap grid gap-1.5">
        <label htmlFor="player-action-reason" className="text-[11px] text-muted-foreground">
          {copy.field}
        </label>
        <div className="t-input rounded-xl border border-border bg-transparent focus-within:ring-2 focus-within:ring-ring [&.is-error]:border-destructive">
          <textarea
            id="player-action-reason"
            ref={fieldRef}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              clearError()
            }}
            rows={3}
            autoFocus
            aria-describedby="player-action-error"
            className="block w-full resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={action === "message" ? "Write the message" : "Why are you doing this?"}
          />
        </div>
        <p id="player-action-error" className="t-error-msg text-xs text-destructive" aria-live="polite">
          Write a {copy.field.toLowerCase()} first.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES[action].map((template) => (
            <button
              key={template}
              type="button"
              onClick={() => {
                setReason(template)
                clearError()
              }}
              className="press h-6 rounded-md bg-muted px-2 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {template}
            </button>
          ))}
        </div>
      </div>

      {action === "ban" ? (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <span id="ban-duration-label" className="text-[11px] text-muted-foreground">
              Duration
            </span>
            <div className="flex items-center gap-0.5 rounded-xl bg-muted p-1" role="radiogroup" aria-labelledby="ban-duration-label">
              {BAN_DURATIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={duration === value}
                  tabIndex={duration === value ? 0 : -1}
                  onClick={() => setDuration(value)}
                  onKeyDown={handleRadioKeyDown}
                  className={cn(
                    "press h-7 flex-1 rounded-lg px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    duration === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          {unbannedLinks.length ? (
            <label className="flex cursor-pointer items-start gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={includeLinked}
                onChange={(event) => setIncludeLinked(event.target.checked)}
                className="mt-0.5 size-3.5 accent-foreground"
              />
              <span>
                Also ban {unbannedLinks.length} linked account{unbannedLinks.length > 1 ? "s" : ""}
                <span className="block font-mono text-[11px] text-muted-foreground">{unbannedLinks.map((entry) => entry.name).join("  ")}</span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      <DialogFooter className="gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline" className="h-8 rounded-lg px-3">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          className={cn("h-8 rounded-lg px-3", (action === "ban" || action === "kick") && "bg-destructive text-white hover:bg-destructive/85 dark:text-white")}
        >
          {copy.confirm}
        </Button>
      </DialogFooter>
    </form>
  )
}
