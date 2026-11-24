"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useAgent, type AgentProblem } from "@/components/agent-store"
import { ACTIONS, INCIDENTS, INITIAL_TICKS, SERVER, type Action, type Incident, type IncidentKind } from "@/lib/mock"

export type ServerStatus = "online" | "restarting" | "stopping" | "offline" | "starting"

export const STATUS_META: Record<ServerStatus, { label: string; tone: "success" | "warning" | "muted" }> = {
  online: { label: "Online", tone: "success" },
  restarting: { label: "Restarting", tone: "warning" },
  stopping: { label: "Stopping", tone: "warning" },
  starting: { label: "Starting", tone: "warning" },
  offline: { label: "Offline", tone: "muted" },
}

type LiveState = {
  status: ServerStatus
  players: number
  peakPlayers: number
  ticks: number[]
  memoryMb: number
  uptime: number
  heartbeatAgo: number
  healthCheckMs: number
  lanes: { fd3: boolean[]; http: boolean[] }
  incidents: Incident[]
  actions: Action[]
}

type LiveServer = LiveState & {
  maxPlayers: number
  pid: number | null
  serverName: string
  measured: boolean
  live: boolean
  tickAvg: number
  start: () => void
  stop: () => void
  restart: () => void
  adjustPlayers: (delta: number) => void
  logAction: (text: string) => void
}

const LANE_LENGTH = 32
const INITIAL_LANE = Array.from({ length: LANE_LENGTH }, (_, index) => index < 6 || index > 9)

const INITIAL_STATE: LiveState = {
  status: "online",
  players: 48,
  peakPlayers: 61,
  ticks: INITIAL_TICKS,
  memoryMb: 1884,
  uptime: 3 * 3600 + 12 * 60 + 8,
  heartbeatAgo: 2,
  healthCheckMs: 38,
  lanes: { fd3: INITIAL_LANE, http: Array.from({ length: LANE_LENGTH }, () => true) },
  incidents: INCIDENTS,
  actions: ACTIONS,
}

const TRANSITION_MS = { restart: 4000, stop: 2200, start: 3200 }

const LiveServerContext = createContext<LiveServer | null>(null)

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function nextTick() {
  const spike = Math.random() < 0.04
  const value = spike ? 38 + Math.random() * 30 : 3.4 + Math.random() * 1.8
  return Math.round(value * 10) / 10
}

export function LiveServerProvider({ children }: { children: ReactNode }) {
  const agent = useAgent()
  const [state, setState] = useState<LiveState>(INITIAL_STATE)
  const [now, setNow] = useState(0)
  const second = useRef(0)
  const actionId = useRef(0)
  const transition = useRef<number | null>(null)
  const statusRef = useRef<ServerStatus>(INITIAL_STATE.status)

  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      second.current += 1
      setNow(Date.now())
      const now = second.current
      setState((previous) => {
        const online = previous.status === "online"
        const next: LiveState = {
          ...previous,
          uptime: online ? previous.uptime + 1 : previous.uptime,
          heartbeatAgo: previous.heartbeatAgo + 1,
          incidents: previous.incidents.map((incident) => ({ ...incident, lastSeen: incident.lastSeen + 1 })),
          actions: previous.actions.map((action) => ({ ...action, secondsAgo: action.secondsAgo + 1 })),
        }
        if (!online) return next
        if (now % 3 === 0) {
          next.heartbeatAgo = 0
          next.healthCheckMs = 30 + Math.round(Math.random() * 16)
          next.lanes = {
            fd3: [...previous.lanes.fd3.slice(1), true],
            http: [...previous.lanes.http.slice(1), true],
          }
        }
        if (now % 2 === 0) {
          next.ticks = [...previous.ticks.slice(1), nextTick()]
          next.memoryMb = clamp(previous.memoryMb + Math.round(Math.random() * 18 - 8), 1700, 2300)
          if (Math.random() < 0.35) {
            const target = previous.players < 44 ? 1 : previous.players > 56 ? -1 : Math.random() < 0.5 ? -1 : 1
            next.players = clamp(previous.players + target, 0, SERVER.maxPlayers)
            next.peakPlayers = Math.max(previous.peakPlayers, next.players)
          }
        }
        if (now % 11 === 0) {
          next.incidents = next.incidents.map((incident) =>
            incident.id === "shop-88" ? { ...incident, count: incident.count + 1, lastSeen: 0 } : incident,
          )
        }
        return next
      })
    }, 1000)
    return () => {
      window.clearInterval(timer)
      if (transition.current !== null) window.clearTimeout(transition.current)
    }
  }, [])

  useEffect(() => {
    if (state.status !== "online" || state.players >= 40 || state.uptime < 2) return
    const timer = window.setTimeout(() => {
      setState((previous) => ({ ...previous, players: Math.min(previous.players + 3 + Math.round(Math.random() * 3), 44) }))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [state.status, state.players, state.uptime])

  const runTransition = useCallback(
    (from: ServerStatus, during: ServerStatus, after: ServerStatus, duration: number, text: string) => {
      if (statusRef.current !== from) return
      statusRef.current = during
      actionId.current += 1
      const id = `action-${actionId.current}`
      setState((previous) => {
        if (previous.status !== from) return previous
        return {
          ...previous,
          status: during,
          players: 0,
          heartbeatAgo: 0,
          actions: [{ id, actor: "you", text, secondsAgo: 0 }, ...previous.actions].slice(0, 6),
        }
      })
      if (transition.current !== null) window.clearTimeout(transition.current)
      transition.current = window.setTimeout(() => {
        transition.current = null
        setState((previous) => {
          if (previous.status !== during) return previous
          return after === "online"
            ? { ...previous, status: "online", uptime: 0, heartbeatAgo: 0, players: 6 }
            : { ...previous, status: after, players: 0 }
        })
      }, duration)
    },
    [],
  )

  const restart = useCallback(
    () => runTransition("online", "restarting", "online", TRANSITION_MS.restart, "restarted the server"),
    [runTransition],
  )
  const stop = useCallback(() => runTransition("online", "stopping", "offline", TRANSITION_MS.stop, "stopped the server"), [runTransition])
  const start = useCallback(() => runTransition("offline", "starting", "online", TRANSITION_MS.start, "started the server"), [runTransition])

  const adjustPlayers = useCallback((delta: number) => {
    setState((previous) =>
      previous.status === "online" ? { ...previous, players: clamp(previous.players + delta, 0, SERVER.maxPlayers) } : previous,
    )
  }, [])

  const logAction = useCallback((text: string) => {
    actionId.current += 1
    const id = `action-${actionId.current}`
    setState((previous) => ({ ...previous, actions: [{ id, actor: "you", text, secondsAgo: 0 }, ...previous.actions].slice(0, 6) }))
  }, [])

  const agentServer = agent.mode === "live" ? agent.server : null
  const agentProblems = agent.problems
  const call = agent.call

  const value = useMemo<LiveServer>(() => {
    const recent = state.ticks.slice(-30)
    const tickAvg = Math.round((recent.reduce((total, tick) => total + tick, 0) / recent.length) * 10) / 10
    const demo = { ...state, maxPlayers: SERVER.maxPlayers, pid: SERVER.pid as number | null, serverName: SERVER.name, measured: true, live: false, tickAvg, start, stop, restart, adjustPlayers, logAction }
    if (!agentServer) return demo
    const control = (action: "start" | "stop" | "restart", text: string) => () => {
      logAction(text)
      void call("POST", `server/${action}`).catch(() => undefined)
    }
    const clock = now || agentServer.onlineSince || 0
    return {
      ...demo,
      measured: false,
      live: true,
      status: agentServer.status,
      players: agentServer.players,
      peakPlayers: Math.max(agentServer.players, 0),
      maxPlayers: agentServer.maxPlayers ?? 0,
      pid: agentServer.pid,
      serverName: agentServer.name,
      uptime: agentServer.onlineSince ? Math.max(0, Math.floor((clock - agentServer.onlineSince) / 1000)) : 0,
      incidents: agentProblems.map((problem) => toIncident(problem, clock)),
      start: control("start", "started the server"),
      stop: control("stop", "stopped the server"),
      restart: control("restart", "restarted the server"),
      adjustPlayers: () => undefined,
    }
  }, [state, start, stop, restart, adjustPlayers, logAction, agentServer, agentProblems, call, now])

  return <LiveServerContext.Provider value={value}>{children}</LiveServerContext.Provider>
}

export function useLiveServer() {
  const context = useContext(LiveServerContext)
  if (!context) throw new Error("useLiveServer must be used inside LiveServerProvider")
  return context
}

const KIND_OF: Record<string, IncidentKind> = {
  "script-error": "error",
  "resource-error": "error",
  "thread-hang": "hang",
  "heartbeat-lost": "hang",
  crashed: "hang",
  "boot-timeout": "hang",
  "crash-loop": "hang",
}

const TITLE_OF: Record<string, string> = {
  "script-error": "Script error",
  "resource-error": "Resource failed",
  "thread-hang": "Server thread hung",
  "heartbeat-lost": "Server stopped answering",
  crashed: "FXServer crashed",
  "boot-timeout": "Server did not finish booting",
  "crash-loop": "Restarts gave up",
  hitch: "Server hitch",
  "port-in-use": "Port already in use",
  "spawn-failed": "FXServer could not start",
}

function clockOf(time: number) {
  const date = new Date(time)
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function toIncident(problem: AgentProblem, now: number): Incident {
  const place = problem.source ?? problem.location
  const resource = problem.resource ?? problem.location?.resource ?? "server"
  return {
    id: problem.id,
    kind: KIND_OF[problem.kind] ?? "warn",
    resource,
    location: place ? `${place.file}:${place.line}` : problem.kind,
    message: problem.message,
    count: problem.count,
    lastSeen: Math.max(0, Math.floor((now - problem.lastSeen) / 1000)),
    firstSeen: clockOf(problem.firstSeen),
    explanation: {
      title: `${TITLE_OF[problem.kind] ?? "Problem"} in ${resource}`,
      what: problem.diagnosis?.cause ?? problem.message,
      impact: problem.impact.summary,
      fix: problem.diagnosis?.steps.join(" ") ?? "Look at the console around the time it happened.",
    },
    ...(problem.introducedBy ? { introducedBy: problem.introducedBy } : {}),
  }
}
