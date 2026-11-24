"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useAgent } from "@/components/agent-store"
import { useConsole } from "@/components/console-store"
import { useLiveServer, type ServerStatus } from "@/components/live-server"
import { parseRemote, type Remote } from "@/lib/repository"
import {
  BRANCHES,
  changedPaths,
  INCOMING_COMMITS,
  INITIAL_DEPLOYS,
  INITIAL_DRIFT,
  STEP_MS,
  STEP_ORDER,
  type Deploy,
  type DeployStep,
  type DriftEntry,
  type ResourceChange,
  type StepId,
} from "@/lib/deploys"

export type DeployView = Deploy & { ageSeconds: number; appliedAgo: number | null }

type CheckResult = "started" | "busy" | "up-to-date"

type DeploysStore = {
  deploys: DeployView[]
  byId: Map<string, DeployView>
  building: boolean
  drift: DriftEntry[]
  branch: string
  connection: Remote | null
  connect: (remote: Remote, branch: string) => void
  disconnect: () => void
  switchBranch: (name: string) => void
  discardDrift: () => void
  applying: boolean
  check: () => CheckResult
  applyNow: (id: string) => void
  cancel: (id: string) => void
  rollback: (id: string) => void
}

const STEP_DETAIL: Record<StepId, (deploy: Deploy) => string> = {
  fetch: () => "1 commit",
  diff: (deploy) => `${deploy.changes.length} ${deploy.changes.length === 1 ? "resource" : "resources"}`,
  install: () => "no changes",
  boot: () => "booted in 3.9s",
  stage: () => "waiting",
}

function pendingSteps(): DeployStep[] {
  return STEP_ORDER.map((id) => ({ id, status: "pending" }))
}

function invert(changes: ResourceChange[]): ResourceChange[] {
  return changes.map((change) => ({
    ...change,
    kind: change.kind === "added" ? "removed" : change.kind === "removed" ? "added" : "changed",
    files: change.files.map((file) => ({ ...file, added: file.removed, removed: file.added })),
  }))
}

const DeploysContext = createContext<DeploysStore | null>(null)

export function DeploysProvider({ children }: { children: ReactNode }) {
  const live = useLiveServer()
  const agent = useAgent()
  const consoleStore = useConsole()
  const [deploys, setDeploys] = useState<Deploy[]>(INITIAL_DEPLOYS)
  const [elapsed, setElapsed] = useState(0)
  const [applying, setApplying] = useState(false)
  const [branch, setBranch] = useState("main")
  const [connection, setConnection] = useState<Remote | null>(null)
  const agentMode = agent.mode
  const agentCall = agent.call

  useEffect(() => {
    if (agentMode !== "live") return
    let cancelled = false
    agentCall<{ connected: boolean; repository?: { url: string; branch: string } }>("GET", "git")
      .then((state) => {
        if (cancelled || !state.connected || !state.repository) return
        setConnection(parseRemote(state.repository.url))
        setBranch(state.repository.branch)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [agentMode, agentCall])
  const [drift, setDrift] = useState<DriftEntry[]>(INITIAL_DRIFT)
  const timers = useRef(new Set<number>())
  const incoming = useRef(0)
  const nextId = useRef(100)
  const elapsedRef = useRef(0)
  const deploysRef = useRef(deploys)
  const liveRef = useRef(live)
  const consoleRef = useRef(consoleStore)
  const driftRef = useRef(drift)
  const branchRef = useRef(branch)

  useEffect(() => {
    elapsedRef.current = elapsed
    deploysRef.current = deploys
    liveRef.current = live
    consoleRef.current = consoleStore
    driftRef.current = drift
    branchRef.current = branch
  })

  useEffect(() => {
    const pending = timers.current
    const clock = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => {
      window.clearInterval(clock)
      pending.forEach((timer) => window.clearTimeout(timer))
      pending.clear()
    }
  }, [])

  const later = useCallback((delay: number, run: () => void) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      run()
    }, delay)
    timers.current.add(timer)
  }, [])

  const patch = useCallback((id: string, change: (deploy: Deploy) => Deploy) => {
    setDeploys((previous) => previous.map((deploy) => (deploy.id === id ? change(deploy) : deploy)))
  }, [])

  const setStep = useCallback(
    (id: string, step: StepId, status: DeployStep["status"], detail?: string) =>
      patch(id, (deploy) => ({
        ...deploy,
        steps: deploy.steps.map((entry) => (entry.id === step ? { ...entry, status, detail: detail ?? entry.detail } : entry)),
      })),
    [patch],
  )

  const runPipeline = useCallback(
    (deploy: Deploy) => {
      let delay = 0
      for (const step of STEP_ORDER) {
        later(delay, () => setStep(deploy.id, step, "running"))
        delay += STEP_MS[step]
        later(delay, () => setStep(deploy.id, step, "done", STEP_DETAIL[step](deploy)))
      }
      later(delay, () => {
        setDeploys((previous) =>
          previous.map((entry) => {
            if (entry.id === deploy.id) return { ...entry, status: "staged" }
            if (entry.status === "staged") return { ...entry, status: "cancelled", failure: `Replaced by ${deploy.commit}` }
            return entry
          }),
        )
        consoleRef.current.announce(`Deploy ${deploy.commit} staged. It goes live at the next restart.`)
      })
    },
    [later, setStep],
  )

  const startDeploy = useCallback(
    (draft: Omit<Deploy, "id" | "createdSecondsAgo" | "status" | "steps">) => {
      const deploy: Deploy = {
        ...draft,
        id: `d-new-${nextId.current++}`,
        createdSecondsAgo: -elapsedRef.current,
        status: "building",
        steps: pendingSteps(),
      }
      setDeploys((previous) => [deploy, ...previous])
      runPipeline(deploy)
      return deploy
    },
    [runPipeline],
  )

  const check = useCallback((): CheckResult => {
    if (deploysRef.current.some((deploy) => deploy.status === "building")) return "busy"
    const commit = branchRef.current === "main" ? INCOMING_COMMITS[incoming.current] : undefined
    if (!commit) {
      consoleRef.current.announce(`Checked origin/${branchRef.current}: already up to date`)
      return "up-to-date"
    }
    incoming.current += 1
    startDeploy(commit)
    liveRef.current.logAction(`pulled ${commit.commit} from origin/${branchRef.current}`)
    return "started"
  }, [startDeploy])

  const applyNow = useCallback((id: string) => {
    const deploy = deploysRef.current.find((entry) => entry.id === id)
    if (!deploy || deploy.status !== "staged" || liveRef.current.status !== "online") return
    setApplying(true)
    consoleRef.current.announce(`Applying deploy ${deploy.commit} now`)
    liveRef.current.restart()
  }, [])

  const cancel = useCallback(
    (id: string) => {
      const deploy = deploysRef.current.find((entry) => entry.id === id)
      if (!deploy || deploy.status !== "staged") return
      patch(id, (entry) => ({
        ...entry,
        status: "cancelled",
        failure: "Cancelled by you",
        steps: entry.steps.map((step) => (step.id === "stage" ? { ...step, detail: "cancelled" } : step)),
      }))
      liveRef.current.logAction(`cancelled deploy ${deploy.commit}`)
      consoleRef.current.announce(`Deploy ${deploy.commit} cancelled. The live code stays as it is.`)
    },
    [patch],
  )

  const rollback = useCallback(
    (id: string) => {
      const target = deploysRef.current.find((entry) => entry.id === id)
      const current = deploysRef.current.find((entry) => entry.status === "live")
      if (!target || !current || target.status !== "superseded" || deploysRef.current.some((entry) => entry.status === "building")) return
      startDeploy({
        commit: target.commit,
        message: `Roll back to ${target.commit}`,
        author: "you",
        branch: target.branch,
        rollbackOf: current.commit,
        changes: invert(current.changes),
      })
      liveRef.current.logAction(`started a rollback to ${target.commit}`)
    },
    [startDeploy],
  )

  const switchBranch = useCallback(
    (name: string) => {
      const from = BRANCHES.find((entry) => entry.name === branchRef.current)
      const to = BRANCHES.find((entry) => entry.name === name)
      if (!from || !to || from.name === to.name || deploysRef.current.some((deploy) => deploy.status === "building")) return
      setBranch(to.name)
      startDeploy({
        commit: to.commit,
        message: to.message,
        author: to.author,
        branch: to.name,
        changes: [...invert(from.changes), ...to.changes],
      })
      liveRef.current.logAction(`switched deploys from ${from.name} to ${to.name}`)
      consoleRef.current.announce(`Now tracking origin/${to.name}. Building ${to.commit}.`)
    },
    [startDeploy],
  )

  const connect = useCallback((remote: Remote, name: string) => {
    if (agentMode === "live") void agentCall("PUT", "git", { url: remote.sshUrl, branch: name }).catch(() => undefined)
    setConnection(remote)
    setBranch(name)
    liveRef.current.logAction(`connected the repository ${remote.owner}/${remote.name}`)
    consoleRef.current.announce(`Connected to ${remote.owner}/${remote.name}. Tracking origin/${name}.`)
  }, [agentMode, agentCall])

  const disconnect = useCallback(() => {
    if (agentMode === "live") void agentCall("PUT", "git", { url: null }).catch(() => undefined)
    setConnection(null)
    liveRef.current.logAction("disconnected the repository")
    consoleRef.current.announce("Repository disconnected. The resources folder stays as it is.")
  }, [agentMode, agentCall])

  const discardDrift = useCallback(() => {
    const count = driftRef.current.length
    if (!count) return
    setDrift([])
    liveRef.current.logAction(`discarded ${count} ${count === 1 ? "file" : "files"} edited on the server`)
    consoleRef.current.announce(`Restored ${count} ${count === 1 ? "file" : "files"} to the last commit`)
  }, [])

  const [lastStatus, setLastStatus] = useState<ServerStatus>(live.status)
  if (lastStatus !== live.status) {
    setLastStatus(live.status)
    if (lastStatus === "restarting" && live.status === "online") {
      const staged = deploys.find((deploy) => deploy.status === "staged")
      if (staged) {
        const overwritten = changedPaths(staged.changes)
        setDrift((previous) => previous.filter((entry) => !overwritten.has(entry.path)))
        setDeploys((previous) =>
          previous.map((deploy) => {
            if (deploy.id === staged.id) {
              return {
                ...deploy,
                status: "live",
                appliedSecondsAgo: -elapsed,
                steps: deploy.steps.map((step) => (step.id === "stage" ? { ...step, detail: "applied" } : step)),
              }
            }
            return deploy.status === "live" ? { ...deploy, status: "superseded" } : deploy
          }),
        )
      }
      setApplying(false)
    }
    if (live.status === "offline" || live.status === "stopping") setApplying(false)
  }

  const announced = useRef(new Set<string>())
  useEffect(() => {
    const current = deploys.find((deploy) => deploy.status === "live")
    if (!current || current.appliedSecondsAgo === undefined || current.appliedSecondsAgo > 0 || announced.current.has(current.id)) return
    announced.current.add(current.id)
    consoleRef.current.announce(`Deploy ${current.commit} is live`)
    liveRef.current.logAction(`applied deploy ${current.commit}`)
  }, [deploys])

  const views = useMemo<DeployView[]>(
    () =>
      deploys.map((deploy) => ({
        ...deploy,
        ageSeconds: Math.max(0, deploy.createdSecondsAgo + elapsed),
        appliedAgo: deploy.appliedSecondsAgo === undefined ? null : Math.max(0, deploy.appliedSecondsAgo + elapsed),
      })),
    [deploys, elapsed],
  )

  const byId = useMemo(() => new Map(views.map((deploy) => [deploy.id, deploy])), [views])
  const building = deploys.some((deploy) => deploy.status === "building")

  const value = useMemo<DeploysStore>(
    () => ({ deploys: views, byId, building, applying, drift, branch, connection, check, applyNow, cancel, rollback, discardDrift, switchBranch, connect, disconnect }),
    [views, byId, building, applying, drift, branch, connection, check, applyNow, cancel, rollback, discardDrift, switchBranch, connect, disconnect],
  )

  return <DeploysContext.Provider value={value}>{children}</DeploysContext.Provider>
}

export function useDeploys() {
  const context = useContext(DeploysContext)
  if (!context) throw new Error("useDeploys must be used inside DeploysProvider")
  return context
}
