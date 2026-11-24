"use client"

import { useCallback, useEffect, useState } from "react"

import { agentCall, useAgent } from "@/components/agent-store"
import { useSettings } from "@/components/settings-store"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

type Channel = "recommended" | "latest" | "optional" | "critical"

type Job = {
  build: string
  channel: Channel
  phase: "downloading" | "extracting" | "done" | "failed"
  received: number
  total: number | null
  error: string | null
}

type ArtifactState = {
  current: string | null
  executable: string
  managed: boolean
  channels: Array<{ channel: Channel; build: string }>
  channelsError: string | null
  installed: Array<{ build: string; installedAt: number }>
  job: Job | null
}

const CHANNEL_LABELS: Record<Channel, string> = {
  recommended: "Recommended",
  latest: "Latest",
  optional: "Optional",
  critical: "Critical",
}

const CHANNEL_HINTS: Record<Channel, string> = {
  recommended: "Tested by the FiveM team. Pick this one.",
  latest: "Newest build. May have new bugs.",
  optional: "Older build kept for compatibility.",
  critical: "Minimum build the FiveM network still accepts.",
}

const BUTTON =
  "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`

export function ArtifactSettings() {
  const { account, mode } = useAgent()
  const { reload } = useSettings()
  const [state, setState] = useState<ArtifactState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [switched, setSwitched] = useState<string | null>(null)
  const live = mode === "live"
  const owner = account?.role === "owner"
  const allowed = live && account?.role !== "moderator"
  const running = state?.job && (state.job.phase === "downloading" || state.job.phase === "extracting")

  const load = useCallback(() => {
    agentCall<ArtifactState>("GET", "artifacts")
      .then(setState)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(load, 700)
    return () => window.clearInterval(timer)
  }, [running, load])

  async function act(key: string, method: "POST", path: string, body: unknown) {
    setBusy(key)
    setError(null)
    try {
      await agentCall(method, path, body)
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Something went wrong"))
      return false
    } finally {
      setBusy(null)
      load()
    }
  }

  async function use(build: string) {
    if (await act(`use-${build}`, "POST", "artifacts/use", { build, restart: false })) {
      setSwitched(build)
      reload()
    }
  }

  async function restart() {
    if (await act("restart", "POST", "server/restart", {})) setSwitched(null)
  }

  const installed = new Set(state?.installed.map((entry) => entry.build))
  const job = state?.job ?? null
  const percent = job?.total ? Math.min(100, Math.round((job.received / job.total) * 100)) : null

  return (
    <section id="section-artifacts" aria-labelledby="section-artifacts-title" className="scroll-mt-6">
      <h2 id="section-artifacts-title" className="text-sm font-semibold">
        FXServer
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("Download and switch FXServer builds without leaving the panel.")}</p>

      {!allowed || !state ? (
        <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-xs text-muted-foreground">
          {live ? t("Only admins and the owner see this.") : t("Start Argus to manage FXServer builds.")}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
          <div className="rounded-xl border border-border/70 px-3 py-2.5 text-xs">
            <p className="font-medium text-foreground/90">
              {state.current ? t("Running build {build}", { build: state.current }) : t("Running a build Argus does not recognize")}
            </p>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={state.executable}>
              {state.executable}
            </p>
          </div>

          {job && job.phase !== "done" ? (
            <div className="rounded-xl bg-muted px-3 py-2.5 text-xs" aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-foreground/90">
                  {job.phase === "failed"
                    ? t("Build {build} failed to install", { build: job.build })
                    : job.phase === "extracting"
                      ? t("Unpacking build {build}", { build: job.build })
                      : t("Downloading build {build}", { build: job.build })}
                </p>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {job.phase === "downloading" ? (percent === null ? megabytes(job.received) : `${percent}%`) : null}
                </span>
              </div>
              {job.phase === "failed" ? (
                <p className="mt-1 text-destructive">{job.error}</p>
              ) : (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-background">
                  <div
                    className={cn("h-full rounded-full bg-foreground transition-[width] duration-300 ease-out motion-reduce:transition-none", job.phase === "extracting" && "w-full animate-pulse")}
                    style={job.phase === "downloading" ? { width: `${percent ?? 8}%` } : undefined}
                  />
                </div>
              )}
            </div>
          ) : null}

          {switched ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5 text-xs">
              <p className="text-foreground/90">{t("Build {build} is set. It runs the next time the server starts.", { build: switched })}</p>
              <button type="button" onClick={() => void restart()} disabled={busy !== null} className={cn(BUTTON, "bg-foreground text-background hover:bg-foreground/90")}>
                {busy === "restart" ? t("Restarting…") : t("Restart now")}
              </button>
            </div>
          ) : null}

          {state.channelsError ? (
            <p className="rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">{t("Could not reach the FiveM build list: {reason}", { reason: state.channelsError })}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/70 rounded-xl border border-border/70">
              {state.channels.map(({ channel, build }) => {
                const current = state.current === build
                const present = installed.has(build)
                return (
                  <li key={channel} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-xs font-medium text-foreground/90">
                        {t(CHANNEL_LABELS[channel])}
                        <span className="font-mono text-[11px] font-normal tabular-nums text-muted-foreground">{build}</span>
                        {current ? <span className="rounded-md bg-success/10 px-1.5 py-px text-[10px] font-medium text-success">{t("In use")}</span> : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{t(CHANNEL_HINTS[channel])}</p>
                    </div>
                    {current ? null : present ? (
                      <button type="button" onClick={() => void use(build)} disabled={!owner || busy !== null || Boolean(running)} className={cn(BUTTON, "border border-border hover:bg-muted")}>
                        {t("Use")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void act(`install-${channel}`, "POST", "artifacts/install", { channel })}
                        disabled={!owner || busy !== null || Boolean(running)}
                        className={cn(BUTTON, "border border-border hover:bg-muted")}
                      >
                        {t("Download")}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {state.installed.length ? (
            <div className="text-xs">
              <p className="font-medium text-foreground/90">{t("Downloaded builds")}</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {state.installed.map(({ build }) => {
                  const current = state.current === build
                  return (
                    <li key={build} className="flex h-9 items-center gap-2 rounded-xl px-2.5 hover:bg-muted">
                      <span className="flex-1 font-mono text-[12px] tabular-nums">{build}</span>
                      {current ? (
                        <span className="text-[11px] text-muted-foreground">{t("In use")}</span>
                      ) : (
                        <>
                          <button type="button" onClick={() => void use(build)} disabled={!owner || busy !== null} className={cn(BUTTON, "h-7 hover:bg-background")}>
                            {t("Use")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void act(`remove-${build}`, "POST", "artifacts/remove", { build })}
                            disabled={!owner || busy !== null}
                            className={cn(BUTTON, "h-7 text-muted-foreground hover:bg-background hover:text-destructive")}
                          >
                            {t("Delete")}
                          </button>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {!owner ? <p className="text-xs text-muted-foreground">{t("Only the owner can download or switch builds.")}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <p className="text-[11px] text-muted-foreground">{t("Builds are saved in the Argus folder. Your server files and resources stay where they are.")}</p>
        </div>
      )}
    </section>
  )
}
