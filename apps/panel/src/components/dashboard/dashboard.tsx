"use client"

import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerTerminal01Icon } from "@hugeicons/core-free-icons"

import { useLiveServer } from "@/components/live-server"
import { StatusBadge } from "@/components/status-badge"
import { SERVER } from "@/lib/mock"

import { PlayersChart, TickChart } from "./charts"
import { Health } from "./health"
import { Incidents } from "./incidents"
import { OnlinePlayers, RecentActions } from "./people"
import { ServerControls } from "./server-controls"
import { StatsStrip } from "./stats-strip"

export function Dashboard() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-3 p-3 md:p-4">
          <StatsStrip />
          <div className="grid gap-3 xl:grid-cols-2">
            <PlayersChart />
            <TickChart />
          </div>
          <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
            <Incidents />
            <Health />
          </div>
          <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
            <OnlinePlayers />
            <RecentActions />
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardHeader() {
  const { status } = useLiveServer()
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border/70 px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-sm font-semibold">Dashboard</h1>
          <StatusBadge status={status} className="h-6 text-[11px]" />
        </div>
        <p className="mt-0.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
          {`${SERVER.name}  pid ${SERVER.pid}  artifact ${SERVER.artifact}  onesync ${SERVER.onesync}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ServerControls />
        <Link
          href="/console"
          className="press hidden h-8.5 items-center gap-1.5 rounded-xl border border-border px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex"
        >
          <HugeiconsIcon icon={ComputerTerminal01Icon} strokeWidth={1.75} className="size-3.5" />
          Open console
        </Link>
      </div>
    </header>
  )
}
