"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon, UserCheck01Icon } from "@hugeicons/core-free-icons"

import { ACTION_BUTTON, DetailRows, HistoryList, IdentifierList, Section } from "@/components/detail-parts"
import { usePlayers } from "@/components/players-store"
import { formatRemaining, type BanRecord } from "@/lib/bans"
import { formatAgo } from "@/lib/mock"
import { initials } from "@/lib/players"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

import { BAN_STATUS, endedSecondsAgo } from "./ban-status"

function timeRows(record: BanRecord): [string, ReactNode][] {
  const rows: [string, ReactNode][] = [
    ["Issued", formatAgo(record.issuedSecondsAgo)],
    ["Length", record.duration.toLowerCase()],
  ]
  if (record.status === "revoked") {
    rows.push(["Revoked", formatAgo(endedSecondsAgo(record))], ["Revoked by", record.revokedBy ?? "unknown"])
  } else if (record.status === "expired") {
    rows.push(["Ended", formatAgo(endedSecondsAgo(record))])
  } else {
    rows.push(["Expires", record.remainingSeconds === null ? "never" : `in ${formatRemaining(record.remainingSeconds)}`])
  }
  return rows
}

export function BanDetail({ record, onRevoke }: { record: BanRecord; onRevoke: (record: BanRecord) => void }) {
  const { byKey, elapsed } = usePlayers()
  const player = record.playerKey ? byKey.get(record.playerKey) : undefined
  const status = BAN_STATUS[record.status]
  const active = record.status === "active"
  const served =
    active && record.totalSeconds !== null ? Math.min(100, Math.max(0, Math.round((record.issuedSecondsAgo / record.totalSeconds) * 100))) : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted font-mono text-xs font-medium">
            {player ? initials(player.name) : "ID"}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{record.playerName}</h2>
            <p className={cn("mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[11px] whitespace-pre", status.text)}>
              <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} />
              <span className="truncate">{`${status.label}  ${record.duration.toLowerCase()} by ${record.actor}`}</span>
            </p>
          </div>
        </div>
        <p className="mt-2.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
          {`${record.id}  issued ${formatAgo(record.issuedSecondsAgo)}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {active ? (
            <button type="button" onClick={() => onRevoke(record)} className={cn(ACTION_BUTTON, "bg-muted text-foreground hover:bg-muted/70")}>
              <HugeiconsIcon icon={UserCheck01Icon} strokeWidth={1.75} className="size-3.5" />
              {t("Revoke ban")}
            </button>
          ) : null}
          {player ? (
            <Link href={`/players?player=${player.key}`} className={cn(ACTION_BUTTON, "border border-border hover:bg-muted")}>
              {t("Open player")}
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={1.75} className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-6">
          <div className={cn("rounded-xl px-3 py-2.5 text-xs", active ? "bg-destructive/10" : "bg-muted")}>
            <p className={cn("font-medium", active ? "text-destructive" : "text-muted-foreground")}>{t("Reason")}</p>
            <p className="mt-1 wrap-break-word text-foreground/90">{record.reason}</p>
            {record.status === "revoked" && record.revokeReason ? (
              <p className="mt-2 wrap-break-word text-muted-foreground">
                {t("Revoked:")} <span className="text-foreground/85">{record.revokeReason}</span>
              </p>
            ) : null}
          </div>

          <Section title={t("Time")} meta={served === null ? undefined : `${served}% served`}>
            {served === null ? null : (
              <div
                role="progressbar"
                aria-label={t("Ban time served")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={served}
                className="mx-2 mb-3 h-1 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-foreground/60" style={{ width: `${served}%` }} />
              </div>
            )}
            <DetailRows rows={timeRows(record)} />
          </Section>

          <Section
            title={t("Blocks")}
            meta={record.playerKey ? `${record.identifiers.length} ids  ${record.tokens} hardware tokens` : "1 identifier"}
          >
            <IdentifierList identifiers={record.identifiers} />
          </Section>

          {player ? (
            <>
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
                          <Link
                            href={`/players?player=${other.key}`}
                            className="flex min-h-9 w-full items-center gap-3 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-muted/60 active:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
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
                            {other.banned ? (
                              <span className="rounded-md bg-destructive/10 px-1.5 text-[11px] leading-5 text-destructive">banned</span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">not banned</span>
                            )}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>

              <Section title={t("Player history")} meta={`${player.history.length} entries`}>
                <HistoryList entries={player.history} elapsed={elapsed} empty={t("No other entries for this player.")} />
              </Section>
            </>
          ) : (
            <p className="px-2 text-xs text-muted-foreground">
              {t("No player with this identifier has joined yet. If one does, the join is refused and shows up in the console.")}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
