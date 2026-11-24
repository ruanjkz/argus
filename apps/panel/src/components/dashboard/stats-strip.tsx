"use client"

import type { ReactNode } from "react"

import { STATUS_META, useLiveServer } from "@/components/live-server"
import { useSettings } from "@/components/settings-store"
import { CONSOLE_END_SECONDS } from "@/lib/console-data"
import { nextRestartTime } from "@/lib/settings"
import { AnimatedNumber, TextSwap } from "@/components/motion-primitives"
import { formatDuration } from "@/lib/mock"
import { cn } from "@/lib/utils"

const TICK_BUDGET = 50

export function StatsStrip() {
  const { players, maxPlayers, peakPlayers, tickAvg, ticks, memoryMb, uptime, status, measured, live } = useLiveServer()
  const peakTick = Math.max(...ticks)
  const { restartTimes } = useSettings().settings
  const nextRestart = nextRestartTime(restartTimes, CONSOLE_END_SECONDS)
  const online = status === "online"
  const uptimeDetail = online ? (nextRestart ? `next restart ${nextRestart}` : "no scheduled restart") : status === "offline" ? "stopped by you" : "waiting for FXServer"

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 lg:grid-cols-4">
      <Stat
        label="Players"
        value={
          <>
            <AnimatedNumber value={players} />
            {maxPlayers ? <span className="text-muted-foreground"> / {maxPlayers}</span> : null}
          </>
        }
        detail={live ? "from the argus heartbeat" : `peak ${peakPlayers} today`}
      />
      <Stat
        label="Tick avg"
        value={
          !measured ? (
            <span className="text-muted-foreground">—</span>
          ) : (
          <>
            <AnimatedNumber value={tickAvg} format={(value) => value.toFixed(1)} />
            <span className="text-base text-muted-foreground"> ms</span>
          </>
          )
        }
        detail={measured ? `peak ${peakTick.toFixed(0)} ms  budget ${TICK_BUDGET} ms` : "not measured yet"}
        detailTone={measured && peakTick > TICK_BUDGET ? "warning" : undefined}
      />
      <Stat
        label="Memory"
        value={
          measured ? (
            <>
              <AnimatedNumber value={memoryMb / 1024} format={(value) => value.toFixed(2)} />
              <span className="text-base text-muted-foreground"> GB</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        detail={measured ? "FXServer process" : "not measured yet"}
      />
      <Stat
        label="Uptime"
        value={<TextSwap text={online ? formatDuration(uptime) : STATUS_META[status].label} />}
        detail={uptimeDetail}
        detailTone={!online && status !== "offline" ? "warning" : undefined}
      />
    </dl>
  )
}

function Stat({
  label,
  value,
  detail,
  detailTone,
}: {
  label: string
  value: ReactNode
  detail: string
  detailTone?: "warning"
}) {
  return (
    <div className="min-w-0 bg-background px-4 py-3.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-2xl font-medium tracking-tight tabular-nums">{value}</dd>
      <dd className={cn("mt-1 truncate font-mono text-[11px] whitespace-pre", detailTone === "warning" ? "text-warning" : "text-muted-foreground")}>
        {detail}
      </dd>
    </div>
  )
}
