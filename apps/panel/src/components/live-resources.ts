"use client"

import { useEffect, useMemo, useState } from "react"

import { agentCall } from "@/components/agent-store"
import type { ResourceStatus, ResourceView } from "@/components/resources-store"
import type { Incident } from "@/lib/mock"
import type { ResourceRuntime } from "@/lib/resources"

type AgentResource = {
  name: string
  folder: string
  description: string
  version: string
  runtime: ResourceRuntime
  dependencies: string[]
  serverScripts: number
  clientScripts: number
  state: string
}

const POLL_MS = 3000

const STATUS_OF: Record<string, ResourceStatus> = {
  started: "started",
  starting: "starting",
  stopping: "stopping",
  stopped: "stopped",
  missing: "failed",
}

export function useLiveResources(enabled: boolean, incidents: Incident[]) {
  const [entries, setEntries] = useState<AgentResource[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () =>
      agentCall<AgentResource[]>("GET", "resources")
        .then((next) => {
          if (!cancelled) setEntries(next)
        })
        .catch(() => undefined)
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled])

  return useMemo<ResourceView[]>(() => {
    const names = new Set(entries.map((entry) => entry.name))
    return entries.map((entry) => {
      const own = incidents.filter((incident) => incident.resource === entry.name)
      return {
        name: entry.name,
        folder: entry.folder || "(root)",
        description: entry.description,
        version: entry.version || "—",
        runtime: entry.runtime,
        dependencies: entry.dependencies,
        serverScripts: entry.serverScripts,
        clientScripts: entry.clientScripts,
        cpuMs: -1,
        memoryKb: -1,
        initial: "started",
        required: entry.name === "argus",
        status: STATUS_OF[entry.state] ?? "stopped",
        liveCpuMs: -1,
        errors: own.filter((incident) => incident.kind === "error").reduce((total, incident) => total + incident.count, 0),
        warnings: own.filter((incident) => incident.kind !== "error").reduce((total, incident) => total + incident.count, 0),
        dependents: entries.filter((other) => other.dependencies.includes(entry.name)).map((other) => other.name),
        missingDependencies: entry.dependencies.filter((dependency) => !names.has(dependency)),
      }
    })
  }, [entries, incidents])
}
