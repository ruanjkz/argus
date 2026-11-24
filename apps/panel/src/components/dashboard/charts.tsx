"use client"

import { useMemo } from "react"

import { EChartsLineChart, type ChartConfig } from "@/components/evilcharts/charts/echarts-line-chart"
import { useLiveServer } from "@/components/live-server"
import { PLAYERS_BY_HOUR } from "@/lib/mock"

import { Panel } from "./panel"

const PLAYERS_CONFIG = {
  baseline: { label: "Yesterday", colors: { light: ["rgba(156, 163, 175, 0.45)"], dark: ["rgba(107, 114, 128, 0.45)"] } },
  current: { label: "Today", colors: { light: ["#2563eb"], dark: ["#7aa7ff"] } },
} satisfies ChartConfig

const TICK_CONFIG = {
  tick: { label: "Tick", colors: { light: ["#2563eb"], dark: ["#7aa7ff"] } },
} satisfies ChartConfig

export function PlayersChart() {
  const { live, players } = useLiveServer()
  if (live) {
    return (
      <Panel title="Players" meta={`${players} online now`}>
        <p className="grid h-52 place-items-center px-6 text-center text-xs text-pretty text-muted-foreground">Argus starts drawing player history after the server has been online for an hour.</p>
      </Panel>
    )
  }
  return (
    <Panel title="Players" meta="today vs yesterday, hourly">
      <EChartsLineChart data={PLAYERS_BY_HOUR} config={PLAYERS_CONFIG} xDataKey="hour" curveType="monotone" animation={false} className="h-52">
        <EChartsLineChart.Grid />
        <EChartsLineChart.XAxis tickFormatter={(value) => value.slice(0, 2)} />
        <EChartsLineChart.YAxis tickFormatter={(value) => String(Math.round(value))} />
        <EChartsLineChart.Tooltip cursor />
        <EChartsLineChart.Legend align="right" verticalAlign="top" />
        <EChartsLineChart.Line dataKey="baseline" strokeWidth={5} />
        <EChartsLineChart.Line dataKey="current" strokeWidth={2} />
      </EChartsLineChart>
    </Panel>
  )
}

export function TickChart() {
  const { ticks, tickAvg, measured } = useLiveServer()
  const data = useMemo(
    () =>
      ticks.map((tick, index) => {
        const secondsAgo = (ticks.length - 1 - index) * 2
        return { time: secondsAgo === 0 ? "now" : `-${secondsAgo}s`, tick }
      }),
    [ticks],
  )
  const peak = Math.max(...ticks)

  if (!measured) {
    return (
      <Panel title="Tick time" meta="not measured yet">
        <p className="grid h-52 place-items-center px-6 text-center text-xs text-pretty text-muted-foreground">Tick time needs the profiler hook in the argus resource. It is not wired up yet.</p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Tick time"
      meta={`last 2 min  avg ${tickAvg.toFixed(1)} ms`}
      action={peak > 50 ? <span className="font-mono text-[11px] text-warning tabular-nums">peak {peak.toFixed(0)} ms</span> : null}
    >
      <EChartsLineChart data={data} config={TICK_CONFIG} xDataKey="time" curveType="linear" animation={false} className="h-52">
        <EChartsLineChart.Grid />
        <EChartsLineChart.XAxis />
        <EChartsLineChart.YAxis tickFormatter={(value) => `${Math.round(value)} ms`} />
        <EChartsLineChart.Tooltip cursor />
        <EChartsLineChart.Line dataKey="tick" strokeWidth={2} />
      </EChartsLineChart>
    </Panel>
  )
}
