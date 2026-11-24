"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

export type AgentStatus = "offline" | "starting" | "online" | "stopping" | "restarting"

export type AgentLine = { id: number; time: number; source: "stdout" | "stderr" | "command" | "system"; text: string }

export type AgentBlame = { commit: string; author: string; time: number; summary: string; uncommitted: boolean }

export type AgentProblem = {
  id: string
  kind: string
  resource?: string
  location?: { resource: string; file: string; line: number }
  source?: { file: string; line: number }
  message: string
  count: number
  firstSeen: number
  lastSeen: number
  impact: { severity: "low" | "medium" | "high" | "critical"; score: number; summary: string }
  diagnosis?: { cause: string; steps: string[]; confidence: "likely" | "confirmed" }
  introducedBy?: AgentBlame
}

type AgentServer = {
  name: string
  version: string
  status: AgentStatus
  pid: number | null
  players: number
  maxPlayers: number | null
  onlineSince: number | null
}

type AgentStateResponse = AgentServer & { lines: AgentLine[]; problems: AgentProblem[] }

export type AgentMode = "connecting" | "setup" | "owner" | "login" | "password" | "live" | "demo"

export type AgentRole = "owner" | "admin" | "moderator"

export type AgentAccount = {
  id: string
  username: string
  role: AgentRole
  mustChangePassword: boolean
  disabled: boolean
  createdAt: number
  createdBy: string | null
  lastLoginAt: number | null
}

type SessionResponse = { account: AgentAccount | null; needsOwner: boolean; canCreateOwner: boolean; remote: boolean }

type AgentStore = {
  mode: AgentMode
  reachable: boolean
  account: AgentAccount | null
  canCreateOwner: boolean
  refresh: () => void
  signOut: () => Promise<void>
  server: AgentServer | null
  lines: AgentLine[]
  problems: AgentProblem[]
  call: <T = unknown>(method: "GET" | "POST" | "PUT", path: string, body?: unknown) => Promise<T>
}

const MAX_LINES = 2000
const AGENT_ORIGIN = process.env.NEXT_PUBLIC_ARGUS_AGENT ?? ""
const RETRY_MS = 3000

export class AgentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function agentCall<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${AGENT_ORIGIN}/api/${path}`, {
    method,
    headers: { "content-type": "application/json", "x-argus": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data ? String((data as { error: unknown }).error) : response.statusText
    throw new AgentError(response.status, message)
  }
  return data as T
}

const AgentContext = createContext<AgentStore | null>(null)

export function AgentProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AgentMode>("connecting")
  const [reachable, setReachable] = useState(false)
  const [server, setServer] = useState<AgentServer | null>(null)
  const [lines, setLines] = useState<AgentLine[]>([])
  const [problems, setProblems] = useState<AgentProblem[]>([])
  const [account, setAccount] = useState<AgentAccount | null>(null)
  const [canCreateOwner, setCanCreateOwner] = useState(false)
  const [generation, setGeneration] = useState(0)
  const lastLine = useRef(-1)

  useEffect(() => {
    let source: EventSource | null = null
    let retry: number | null = null
    let disposed = false
    let everLive = false

    const append = (incoming: AgentLine[]) => {
      const fresh = incoming.filter((line) => line.id > lastLine.current)
      if (!fresh.length) return
      lastLine.current = fresh[fresh.length - 1].id
      setLines((previous) => {
        const merged = previous.concat(fresh)
        return merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged
      })
    }

    const upsertProblem = (problem: AgentProblem) =>
      setProblems((previous) => {
        const index = previous.findIndex((entry) => entry.id === problem.id)
        if (index === -1) return [problem, ...previous]
        const next = previous.slice()
        next[index] = problem
        return next
      })

    const scheduleRetry = () => {
      if (disposed || retry !== null) return
      retry = window.setTimeout(() => {
        retry = null
        void connect()
      }, RETRY_MS)
    }

    const listen = () => {
      source?.close()
      source = new EventSource(`${AGENT_ORIGIN}/api/events`)
      const read = <T,>(event: Event) => JSON.parse((event as MessageEvent<string>).data) as T
      source.addEventListener("line", (event) => append([read<AgentLine>(event)]))
      source.addEventListener("status", (event) => {
        const data = read<{ status: AgentStatus; pid: number | null; onlineSince: number | null }>(event)
        setServer((previous) => (previous ? { ...previous, status: data.status, pid: data.pid, onlineSince: data.onlineSince } : previous))
      })
      source.addEventListener("players", (event) => {
        const data = read<{ players: number }>(event)
        setServer((previous) => (previous ? { ...previous, players: data.players } : previous))
      })
      source.addEventListener("problem", (event) => upsertProblem(read<AgentProblem>(event)))
      source.onerror = () => {
        if (source?.readyState !== EventSource.CLOSED) return
        source = null
        setReachable(false)
        scheduleRetry()
      }
    }

    const connect = async () => {
      try {
        const session = await agentCall<SessionResponse>("GET", "session").catch((error: unknown) => {
          if (error instanceof AgentError && error.status === 409) return null
          throw error
        })
        if (disposed) return
        if (session) {
          setAccount(session.account)
          setCanCreateOwner(session.canCreateOwner)
          if (session.needsOwner && !session.account) {
            setReachable(true)
            setMode("owner")
            return
          }
          if (!session.account) {
            setReachable(true)
            setMode("login")
            return
          }
          if (session.account.mustChangePassword) {
            setReachable(true)
            setMode("password")
            return
          }
        }
        const state = await agentCall<AgentStateResponse>("GET", "state")
        if (disposed) return
        everLive = true
        setMode("live")
        setReachable(true)
        setServer({
          name: state.name,
          version: state.version,
          status: state.status,
          pid: state.pid,
          players: state.players,
          maxPlayers: state.maxPlayers,
          onlineSince: state.onlineSince,
        })
        setProblems(state.problems)
        append(state.lines)
        listen()
      } catch (error) {
        if (disposed) return
        if (error instanceof AgentError && error.status === 409) {
          setReachable(true)
          setMode("setup")
          return
        }
        if (error instanceof AgentError && error.status === 401) {
          setReachable(true)
          setMode("login")
          return
        }
        if (error instanceof AgentError && error.status === 428) {
          setReachable(true)
          setMode("password")
          return
        }
        setReachable(false)
        if (everLive) scheduleRetry()
        else setMode("demo")
      }
    }

    void connect()
    return () => {
      disposed = true
      source?.close()
      if (retry !== null) window.clearTimeout(retry)
    }
  }, [generation])

  const refresh = useCallback(() => setGeneration((value) => value + 1), [])

  const signOut = useCallback(async () => {
    await agentCall("POST", "session/logout").catch(() => undefined)
    setAccount(null)
    setMode("login")
  }, [])

  const call = useCallback(<T,>(method: "GET" | "POST" | "PUT", path: string, body?: unknown) => agentCall<T>(method, path, body), [])

  const value = useMemo<AgentStore>(
    () => ({ mode, reachable, account, canCreateOwner, refresh, signOut, server, lines, problems, call }),
    [mode, reachable, account, canCreateOwner, refresh, signOut, server, lines, problems, call],
  )

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

export function useAgent() {
  const context = useContext(AgentContext)
  if (!context) throw new Error("useAgent must be used inside AgentProvider")
  return context
}
