"use client"

import { useState, type FormEvent } from "react"

import { usePlayers } from "@/components/players-store"
import { useSettings } from "@/components/settings-store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BAN_DURATIONS, IDENTIFIER_PATTERN, type BanRecord } from "@/lib/bans"
import { handleRadioKeyDown } from "@/lib/radio-group"
import { useFieldError } from "@/lib/use-field-error"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

const REVOKE_TEMPLATES = ["Appeal accepted", "Wrong player", "Ban time served"]
const BAN_TEMPLATES = ["Cheating", "Ban evasion", "Toxic chat after warnings", "Exploiting"]

const FIELD_BOX =
  "t-input rounded-xl border border-border bg-transparent focus-within:ring-2 focus-within:ring-ring [&.is-error]:border-destructive"

const TEMPLATE_CHIP =
  "press h-6 rounded-md bg-muted px-2 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

export function RevokeDialog({ record, onClose }: { record: BanRecord | null; onClose: () => void }) {
  return (
    <Dialog open={record !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="rounded-2xl p-5 sm:max-w-md">
        {record ? <RevokeForm key={record.entryId} record={record} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function RevokeForm({ record, onClose }: { record: BanRecord; onClose: () => void }) {
  const { unban, revokeManualBan } = usePlayers()
  const [reason, setReason] = useState("")
  const { wrapRef, fieldRef, show: showError, clear: clearError } = useFieldError<HTMLTextAreaElement>()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = reason.trim()
    if (!text) {
      showError()
      return
    }
    if (record.playerKey) unban(record.playerKey, text)
    else revokeManualBan(record.entryId, text)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-sm font-semibold wrap-anywhere">Revoke the ban on {record.playerName}</DialogTitle>
        <DialogDescription className="text-xs wrap-anywhere text-muted-foreground">
          {t("They can join again right away. The ban stays in the history as revoked, with your reason.")}
        </DialogDescription>
      </DialogHeader>

      <div ref={wrapRef} className="t-input-wrap grid gap-1.5">
        <label htmlFor="revoke-reason" className="text-[11px] text-muted-foreground">
          {t("Reason")}
        </label>
        <div className={FIELD_BOX}>
          <textarea
            id="revoke-reason"
            ref={fieldRef}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              clearError()
            }}
            rows={3}
            autoFocus
            aria-describedby="revoke-error"
            placeholder={t("Why is this ban being lifted?")}
            className="block w-full resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <p id="revoke-error" className="t-error-msg text-xs text-destructive" aria-live="polite">
          {t("Write a reason first.")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {REVOKE_TEMPLATES.map((template) => (
            <button
              key={template}
              type="button"
              onClick={() => {
                setReason(template)
                clearError()
              }}
              className={TEMPLATE_CHIP}
            >
              {template}
            </button>
          ))}
        </div>
      </div>

      <DialogFooter className="gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline" className="h-8 rounded-lg px-3">
            {t("Cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" className="h-8 rounded-lg px-3">
          {t("Revoke ban")}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function NewBanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showCloseButton={false} className="rounded-2xl p-5 sm:max-w-md">
        {open ? <NewBanForm onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function NewBanForm({ onClose }: { onClose: () => void }) {
  const { players, banIdentifier } = usePlayers()
  const { defaultBanDuration } = useSettings().settings
  const [identifier, setIdentifier] = useState("")
  const [reason, setReason] = useState("")
  const [duration, setDuration] = useState(defaultBanDuration)
  const [identifierMessage, setIdentifierMessage] = useState("")
  const {
    wrapRef: identifierWrapRef,
    fieldRef: identifierFieldRef,
    show: showIdentifierError,
    clear: clearIdentifierError,
  } = useFieldError<HTMLInputElement>()
  const {
    wrapRef: reasonWrapRef,
    fieldRef: reasonFieldRef,
    show: showReasonError,
    clear: clearReasonError,
  } = useFieldError<HTMLTextAreaElement>()
  const value = identifier.trim()
  const match = value ? players.find((player) => player.identifiers.some((entry) => entry.value === value)) : undefined

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!IDENTIFIER_PATTERN.test(value)) {
      setIdentifierMessage("Use a full identifier, like license:… or discord:…")
      showIdentifierError()
      return
    }
    if (match?.banned) {
      setIdentifierMessage(`${match.name} is already banned.`)
      showIdentifierError()
      return
    }
    const text = reason.trim()
    if (!text) {
      showReasonError()
      return
    }
    banIdentifier(value, text, duration)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="text-sm font-semibold">{t("Ban by identifier")}</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {t("Blocks a license, Discord, Steam, FiveM or IP identifier, even if that player never joined this server.")}
        </DialogDescription>
      </DialogHeader>

      <div ref={identifierWrapRef} className="t-input-wrap grid gap-1.5">
        <label htmlFor="ban-identifier" className="text-[11px] text-muted-foreground">
          {t("Identifier")}
        </label>
        <div className={FIELD_BOX}>
          <input
            id="ban-identifier"
            ref={identifierFieldRef}
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value)
              clearIdentifierError()
            }}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            aria-describedby="ban-identifier-error"
            placeholder="license:3f2a…"
            className="block h-9 w-full bg-transparent px-3 font-mono text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <p id="ban-identifier-error" className="t-error-msg text-xs text-destructive" aria-live="polite">
          {identifierMessage || "Use a full identifier."}
        </p>
        {match && !match.banned ? (
          <p className="text-xs text-muted-foreground">
            {t("Matches")} <span className="text-foreground/90">{match.name}</span>. The ban goes on their record.
          </p>
        ) : null}
      </div>

      <div ref={reasonWrapRef} className="t-input-wrap grid gap-1.5">
        <label htmlFor="ban-reason" className="text-[11px] text-muted-foreground">
          {t("Reason")}
        </label>
        <div className={FIELD_BOX}>
          <textarea
            id="ban-reason"
            ref={reasonFieldRef}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              clearReasonError()
            }}
            rows={2}
            aria-describedby="ban-reason-error"
            placeholder={t("Why are you banning this identifier?")}
            className="block w-full resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <p id="ban-reason-error" className="t-error-msg text-xs text-destructive" aria-live="polite">
          {t("Write a reason first.")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BAN_TEMPLATES.map((template) => (
            <button
              key={template}
              type="button"
              onClick={() => {
                setReason(template)
                clearReasonError()
              }}
              className={TEMPLATE_CHIP}
            >
              {template}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <span id="new-ban-duration" className="text-[11px] text-muted-foreground">
          {t("Duration")}
        </span>
        <div className="flex items-center gap-0.5 rounded-xl bg-muted p-1" role="radiogroup" aria-labelledby="new-ban-duration">
          {BAN_DURATIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={duration === option}
              tabIndex={duration === option ? 0 : -1}
              onClick={() => setDuration(option)}
              onKeyDown={handleRadioKeyDown}
              className={cn(
                "press h-7 flex-1 rounded-lg px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                duration === option ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <DialogFooter className="gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline" className="h-8 rounded-lg px-3">
            {t("Cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" className="h-8 rounded-lg bg-destructive px-3 text-white hover:bg-destructive/85 dark:text-white">
          {t("Ban identifier")}
        </Button>
      </DialogFooter>
    </form>
  )
}
