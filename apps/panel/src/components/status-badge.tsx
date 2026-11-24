"use client"

import { STATUS_META, type ServerStatus } from "@/components/live-server"
import { TextSwap } from "@/components/motion-primitives"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

const TONE_STYLES = {
  success: { badge: "bg-success/12 text-success", dot: "bg-success" },
  warning: { badge: "bg-warning/12 text-warning", dot: "bg-warning" },
  muted: { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
}

export function StatusBadge({
  status,
  onlineLabel,
  className,
}: {
  status: ServerStatus
  onlineLabel?: string
  className?: string
}) {
  const meta = STATUS_META[status]
  const tone = TONE_STYLES[meta.tone]
  const label = status === "online" && onlineLabel ? onlineLabel : meta.label
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium", tone.badge, className)}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} />
      <TextSwap text={t(label)} />
    </span>
  )
}
