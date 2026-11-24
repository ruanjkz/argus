"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useAgent } from "@/components/agent-store"
import { useLiveResources } from "@/components/live-resources"
import { useLiveServer } from "@/components/live-server"
import { useSettings } from "@/components/settings-store"
import { RESOURCE_CATALOG, type ResourceInfo } from "@/lib/resources"
import { startupCoverage } from "@/lib/settings"

export type ResourceStatus = "started" | "stopped" | "starting" | "stopping" | "failed"

export type ResourceView = ResourceInfo & {
  status: ResourceStatus
  liveCpuMs: number
  errors: number
  warnings: number
  dependents: string[]
  missingDependencies: string[]
}

type ResourcesStore = {
  resources: ResourceView[]
  byName: Map<string, ResourceView>
  serverOnline: boolean
  start: (name: string) => void
  stop: (name: string) => void
  restart: (name: string) => void
}

export const RESOURCE_START_MS = 520
export const RESOURCE_STOP_MS = 300

const CATALOG_BY_NAME = new Map(RESOURCE_CATALOG.map((entry) => [entry.name, entry]))

const DEPENDENTS = new Map(
  RESOURCE_CATALOG.map((entry) => [
    entry.name,
    RESOURCE_CATALOG.filter((other) => other.dependencies.includes(entry.name)).map((other) => other.name),
  ]),
)

function bootStates(startup: string[]): Record<string, ResourceStatus> {
  const covered = startupCoverage(startup)
  return Object.fromEntries(
    RESOURCE_CATALOG.map((entry) => [entry.name, covered.has(entry.name) ? (entry.failure ? "failed" : "started") : "stopped"]),
  )
}

function hash(value: string) {
  let result = 0
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0
  return result
}

const ResourcesContext = createContext<ResourcesStore | null>(null)

export function ResourcesProvider({ children }: { children: ReactNode }) {
  const live = useLiveServer()
  const { startup } = useSettings().settings
  const serverOnline = live.status === "online"
  const [states, setStates] = useState<Record<string, ResourceStatus>>(() => bootStates(startup))
  const timers = useRef(new Map<string, number>())
  const statesRef = useRef(states)
  const onlineRef = useRef(serverOnline)

  useEffect(() => {
    statesRef.current = states
    onlineRef.current = serverOnline
  })

  const [wasOnline, setWasOnline] = useState(serverOnline)
  if (wasOnline !== serverOnline) {
    setWasOnline(serverOnline)
    if (serverOnline) setStates(bootStates(startup))
  }

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer))
      pending.clear()
    }
  }, [serverOnline])

  const setStatus = useCallback((name: string, status: ResourceStatus) => {
    setStates((previous) => (previous[name] === status ? previous : { ...previous, [name]: status }))
  }, [])

  const schedule = useCallback((name: string, delay: number, run: () => void) => {
    const existing = timers.current.get(name)
    if (existing !== undefined) window.clearTimeout(existing)
    timers.current.set(
      name,
      window.setTimeout(() => {
        timers.current.delete(name)
        run()
      }, delay),
    )
  }, [])

  const finishStart = useCallback(
    (name: string) => {
      setStatus(name, "starting")
      schedule(name, RESOURCE_START_MS, () => setStatus(name, CATALOG_BY_NAME.get(name)?.failure ? "failed" : "started"))
    },
    [schedule, setStatus],
  )

  const start = useCallback(
    (name: string) => {
      const status = statesRef.current[name]
      if (!onlineRef.current || status === undefined || status === "started" || status === "starting") return
      finishStart(name)
    },
    [finishStart],
  )

  const stop = useCallback(
    (name: string) => {
      if (!onlineRef.current || statesRef.current[name] !== "started" || CATALOG_BY_NAME.get(name)?.required) return
      setStatus(name, "stopping")
      schedule(name, RESOURCE_STOP_MS, () => setStatus(name, "stopped"))
    },
    [schedule, setStatus],
  )

  const restart = useCallback(
    (name: string) => {
      const status = statesRef.current[name]
      if (!onlineRef.current || status === undefined) return
      if (status !== "started") {
        start(name)
        return
      }
      setStatus(name, "stopping")
      schedule(name, RESOURCE_STOP_MS, () => finishStart(name))
    },
    [finishStart, schedule, setStatus, start],
  )

  const cpuTick = Math.floor(live.uptime / 2)
  const incidents = live.incidents

  const resources = useMemo<ResourceView[]>(
    () =>
      RESOURCE_CATALOG.map((entry) => {
        const status: ResourceStatus = serverOnline ? (states[entry.name] ?? "stopped") : "stopped"
        const own = incidents.filter((incident) => incident.resource === entry.name)
        const jitter = 0.92 + ((hash(entry.name) + cpuTick * 13) % 17) / 100
        return {
          ...entry,
          status,
          liveCpuMs: status === "started" ? Math.round(entry.cpuMs * jitter * 100) / 100 : 0,
          errors: own.filter((incident) => incident.kind === "error").reduce((total, incident) => total + incident.count, 0),
          warnings: own.filter((incident) => incident.kind !== "error").reduce((total, incident) => total + incident.count, 0),
          dependents: DEPENDENTS.get(entry.name) ?? [],
          missingDependencies: entry.dependencies.filter((dependency) => !CATALOG_BY_NAME.has(dependency)),
        }
      }),
    [states, serverOnline, incidents, cpuTick],
  )

  const byName = useMemo(() => new Map(resources.map((resource) => [resource.name, resource])), [resources])

  const agentLive = useAgent().mode === "live"
  const liveResources = useLiveResources(agentLive, incidents)
  const liveByName = useMemo(() => new Map(liveResources.map((resource) => [resource.name, resource])), [liveResources])

  const value = useMemo<ResourcesStore>(
    () =>
      agentLive
        ? { resources: liveResources, byName: liveByName, serverOnline, start, stop, restart }
        : { resources, byName, serverOnline, start, stop, restart },
    [agentLive, liveResources, liveByName, resources, byName, serverOnline, start, stop, restart],
  )

  return <ResourcesContext.Provider value={value}>{children}</ResourcesContext.Provider>
}

export function useResources() {
  const context = useContext(ResourcesContext)
  if (!context) throw new Error("useResources must be used inside ResourcesProvider")
  return context
}
