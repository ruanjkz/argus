"use client"

import { Tooltip as TooltipPrimitive } from "radix-ui"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Activity01Icon, Alert02Icon, Clock01Icon } from "@hugeicons/core-free-icons"

import { useLiveServer } from "@/components/live-server"
import { AnimatedNumber } from "@/components/motion-primitives"
import { formatAgo, type Incident, type IncidentKind } from "@/lib/mock"
import { IncidentOriginText } from "@/components/incident-origin"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

import { Panel } from "./panel"

const KIND_META: Record<IncidentKind, { icon: IconSvgElement; tone: string; label: string }> = {
  error: { icon: Alert02Icon, tone: "text-destructive", label: t("Script error") },
  hang: { icon: Clock01Icon, tone: "text-destructive", label: t("Thread hung") },
  warn: { icon: Activity01Icon, tone: "text-warning", label: t("Slow tick") },
}

export function Incidents() {
  const { incidents } = useLiveServer()
  const total = incidents.reduce((sum, incident) => sum + incident.count, 0)

  return (
    <Panel title={t("Incidents")} meta={`${incidents.length} groups  ${total} events today`} bodyClassName="px-2 pb-2">
      <ul className="flex flex-col">
        {incidents.map((incident) => (
          <IncidentRow key={incident.id} incident={incident} />
        ))}
      </ul>
    </Panel>
  )
}

function IncidentRow({ incident }: { incident: Incident }) {
  const meta = KIND_META[incident.kind]
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <li
          tabIndex={0}
          className="flex cursor-default items-start gap-3 rounded-xl px-2 py-2.5 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=delayed-open]:bg-muted/60 data-[state=instant-open]:bg-muted/60"
        >
          <HugeiconsIcon icon={meta.icon} strokeWidth={1.75} className={cn("mt-0.5 size-4 shrink-0", meta.tone)} aria-label={meta.label} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[13px] text-foreground/90">
              {incident.resource}
              <span className="text-muted-foreground">/{incident.location}</span>
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{incident.message}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-xs text-foreground/90">
              <AnimatedNumber value={incident.count} />×
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">{formatAgo(incident.lastSeen)}</p>
          </div>
        </li>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="t-dropdown z-50 w-80 max-w-[calc(100vw-1.5rem)] origin-(--radix-tooltip-content-transform-origin) rounded-xl border border-border/70 bg-popover p-3 text-popover-foreground shadow-lg shadow-black/5"
        >
          <IncidentExplanation incident={incident} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

function IncidentExplanation({ incident }: { incident: Incident }) {
  const meta = KIND_META[incident.kind]
  const { title, what, impact, fix } = incident.explanation
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium">
        <HugeiconsIcon icon={meta.icon} strokeWidth={1.75} className={cn("size-4 shrink-0", meta.tone)} />
        {title}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{what}</p>
      <dl className="mt-3 grid grid-cols-[3.25rem_1fr] gap-x-3 gap-y-2 text-xs leading-relaxed">
        <dt className="text-muted-foreground">{t("Impact")}</dt>
        <dd className="text-foreground/90">{impact}</dd>
        <dt className="text-muted-foreground">{t("Fix")}</dt>
        <dd className="text-foreground/90">{fix}</dd>
        {incident.introducedBy ? (
          <>
            <dt className="text-muted-foreground">{t("Since")}</dt>
            <dd className="text-foreground/90">
              <IncidentOriginText origin={incident.introducedBy} />
            </dd>
          </>
        ) : null}
      </dl>
      <p className="mt-3 border-t border-border/70 pt-2 font-mono text-[11px] whitespace-pre text-muted-foreground">
        {`${incident.count}×  first seen ${incident.firstSeen}  last ${formatAgo(incident.lastSeen)}`}
      </p>
    </div>
  )
}
