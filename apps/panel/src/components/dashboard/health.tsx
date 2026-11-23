"use client"

import { useLiveServer } from "@/components/live-server"
import { StatusBadge } from "@/components/status-badge"
import { SERVER } from "@/lib/mock"
import { cn } from "@/lib/utils"

import { Panel } from "./panel"

export function Health() {
  const { status, heartbeatAgo, healthCheckMs, lanes } = useLiveServer()
  const online = status === "online"
  const heartbeatText = online ? (heartbeatAgo === 0 ? "now" : `${heartbeatAgo}s ago`) : status === "offline" ? "offline" : "waiting"

  return (
    <Panel
      title="Health"
      meta="heartbeat every 3s over fd3 and http"
      action={<StatusBadge status={status} onlineLabel="Healthy" className="h-6 text-[11px]" />}
    >
      <div className="flex flex-col gap-2">
        {(["fd3", "http"] as const).map((lane) => (
          <div key={lane} className="flex items-center gap-3">
            <span className="w-9 font-mono text-[11px] text-muted-foreground">{lane}</span>
            <div className="flex flex-1 gap-[3px]" role="img" aria-label={`${lane} heartbeats over the last 96 seconds`}>
              {lanes[lane].map((beat, index) => (
                <span key={index} className={cn("h-3 flex-1 rounded-[2px]", beat ? "bg-chart-2/50" : "bg-destructive/50")} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-[7rem_minmax(0,1fr)] gap-y-2 text-xs [&_dd]:whitespace-pre">
        <dt className="text-muted-foreground">Last heartbeat</dt>
        <dd className="font-mono tabular-nums">{heartbeatText}</dd>
        <dt className="text-muted-foreground">Health check</dt>
        <dd className="font-mono tabular-nums">{online ? `200  ${healthCheckMs} ms` : "unreachable"}</dd>
        <dt className="text-muted-foreground">Endpoint</dt>
        <dd className="truncate font-mono">{SERVER.endpoint}</dd>
        <dt className="text-muted-foreground">Last hang</dt>
        <dd className="font-mono">inventory  4.1s  21m ago</dd>
      </dl>
    </Panel>
  )
}
