"use client"

import { useCallback, useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, GitBranchIcon, Loading03Icon, RefreshIcon } from "@hugeicons/core-free-icons"

import { agentCall, useAgent } from "@/components/agent-store"
import { useDeploys } from "@/components/deploys-store"

import { ConnectWizard } from "./connect-wizard"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { t } from "@/lib/i18n"
import { formatAgo } from "@/lib/mock"
import { cn } from "@/lib/utils"

type Commit = { commit: string; message: string; author: string; time: number }
type Drift = { path: string; state: string; resource?: string }
type DeployState =
  | { repository: false; connected: boolean; branch: string | null }
  | { repository: true; connected: boolean; branch: string; head: string; commits: Commit[]; drift: Drift[]; wanted: string | null }
type FileChange = { path: string; added: number; removed: number }
type Change = { resource: string; folder: string; kind: string; files: FileChange[] }
type Incoming = { branch: string; incoming: Commit[]; changes: Change[] }

const BUTTON =
  "press inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

export function LiveDeploys() {
  const { connection } = useDeploys()
  const { account } = useAgent()
  const [state, setState] = useState<DeployState | null>(null)
  const [incoming, setIncoming] = useState<Incoming | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<"restart" | "later" | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const canDeploy = account?.role === "owner" || account?.role === "admin"

  const load = useCallback(() => {
    agentCall<DeployState>("GET", "deploys")
      .then((next) => {
        setState(next)
        setLoadedAt(Date.now())
      })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Could not read the repository"))
    agentCall<string[]>("GET", "deploys/branches")
      .then(setBranches)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    load()
  }, [load, connection])

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label)
    setError(null)
    try {
      await work()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That did not work")
    } finally {
      setBusy(null)
    }
  }

  const check = () =>
    run("check", async () => {
      setIncoming(await agentCall<Incoming>("POST", "deploys/fetch"))
      load()
    })

  const apply = (restart: boolean) =>
    run("apply", async () => {
      setState(await agentCall<DeployState>("POST", "deploys/apply", { restart }))
      setIncoming(null)
    })

  const switchBranch = (name: string) =>
    run("branch", async () => {
      setState(await agentCall<DeployState>("POST", "deploys/branch", { name }))
      setIncoming(null)
    })

  const blocking = state?.repository ? state.drift.filter((entry) => entry.state !== "untracked") : []
  const repoName = connection ? `${connection.owner}/${connection.name}` : t("Repository")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{t("Deploys")}</h1>
          <p className="mt-0.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
            {state?.repository ? `${repoName}  ${state.branch}  ${state.head}` : repoName}
          </p>
        </div>
        {state?.repository && canDeploy ? (
          <div className="flex items-center gap-2">
            <label className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-xs">
              <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.75} className="size-3.5 text-muted-foreground" />
              <span className="sr-only">{t("Switch branch")}</span>
              <select
                value={state.branch}
                disabled={busy !== null || account?.role !== "owner"}
                onChange={(event) => void switchBranch(event.target.value)}
                className="max-w-40 bg-transparent font-mono outline-none"
              >
                {[...new Set([state.branch, ...branches])].map((name) => (
                  <option key={name} value={name} className="bg-background">
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void check()} disabled={busy !== null} className={cn(BUTTON, "border border-border hover:bg-muted")}>
              <HugeiconsIcon
                icon={busy === "check" ? Loading03Icon : RefreshIcon}
                strokeWidth={1.75}
                className={cn("size-3.5", busy === "check" && "animate-spin motion-reduce:animate-none")}
              />
              {t("Check for updates")}
            </button>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-6">
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          ) : null}

          {state && !state.connected ? (
            <section className="overflow-hidden rounded-2xl border border-border/70">
              <ConnectWizard />
            </section>
          ) : null}

          {state && !state.repository && state.connected ? (
            <section className="rounded-2xl border border-border/70 p-5 text-sm">
              <h2 className="font-medium">{t("The resources folder is not a git checkout yet")}</h2>
              <p className="mt-1 text-xs text-pretty text-muted-foreground">
                {t("Argus deploys by updating the resources folder with git. Make it a clone of your repository once, on the server:")}
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-3 font-mono text-[12px] leading-6">
                {`cd <server-data>\\resources\ngit init\ngit remote add origin ${connection?.sshUrl ?? "<repository>"}\ngit fetch origin ${state.branch ?? "main"}\ngit checkout -t origin/${state.branch ?? "main"}`}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("If the folder already has files, back it up first: the checkout replaces files that also exist in the repository.")}
              </p>
            </section>
          ) : null}

          {blocking.length ? (
            <section className="rounded-2xl border border-warning/40 bg-warning/5 p-4 text-xs">
              <p className="font-medium text-foreground/90">{t("{count} files were edited on the server", { count: blocking.length })}</p>
              <p className="mt-0.5 text-muted-foreground">{t("Deploys stop until these edits are committed to the repository or undone on the server.")}</p>
              <ul className="mt-2 flex flex-col gap-1 font-mono text-[11px]">
                {blocking.slice(0, 20).map((entry) => (
                  <li key={entry.path} className="flex justify-between gap-3">
                    <span className="truncate">{entry.path}</span>
                    <span className="shrink-0 text-muted-foreground">{entry.state}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {incoming ? (
            <section className="rounded-2xl border border-border/70 p-4">
              {incoming.incoming.length === 0 ? (
                <p className="text-sm">{t("Up to date with origin/{branch}.", { branch: incoming.branch })}</p>
              ) : (
                <>
                  <h2 className="text-sm font-medium">{t("{count} new commits on origin/{branch}", { count: incoming.incoming.length, branch: incoming.branch })}</h2>
                  <ul className="mt-3 flex flex-col gap-1.5 text-xs">
                    {incoming.incoming.map((commit) => (
                      <li key={commit.commit} className="flex gap-3">
                        <span className="font-mono text-muted-foreground">{commit.commit}</span>
                        <span className="min-w-0 flex-1 truncate">{commit.message}</span>
                        <span className="shrink-0 text-muted-foreground">{commit.author}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3">
                    {incoming.changes.map((change) => (
                      <li key={`${change.folder}/${change.resource}`} className="text-xs">
                        <span className="font-mono text-foreground/90">{change.resource}</span>
                        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{change.folder}</span>
                        <span className="ml-2 font-mono text-[11px] text-success">+{change.files.reduce((total, file) => total + file.added, 0)}</span>
                        <span className="ml-1 font-mono text-[11px] text-destructive">-{change.files.reduce((total, file) => total + file.removed, 0)}</span>
                      </li>
                    ))}
                  </ul>
                  {canDeploy ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setConfirm("restart")} disabled={busy !== null} className={cn(BUTTON, "bg-primary text-primary-foreground hover:bg-primary/85")}>
                        {t("Update and restart")}
                      </button>
                      <button type="button" onClick={() => setConfirm("later")} disabled={busy !== null} className={cn(BUTTON, "border border-border hover:bg-muted")}>
                        {t("Update, restart later")}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {state?.repository ? (
            <section>
              <h2 className="text-sm font-medium">{t("History")}</h2>
              <ol className="mt-3 flex flex-col divide-y divide-border/60 rounded-xl border border-border/70">
                {state.commits.map((commit, index) => (
                  <li key={commit.commit} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                    <span className={cn("size-1.5 shrink-0 rounded-full", index === 0 ? "bg-success" : "bg-muted-foreground/40")} />
                    <span className="font-mono text-muted-foreground">{commit.commit}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground/90">{commit.message}</span>
                    {index === 0 ? <span className="rounded-md bg-success/10 px-1.5 text-[11px] text-success">{t("Live")}</span> : null}
                    <span className="hidden shrink-0 text-muted-foreground sm:inline">{commit.author}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatAgo(Math.max(0, Math.floor((loadedAt - commit.time) / 1000)))}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{confirm === "restart" ? t("Update and restart now?") : t("Update the files now?")}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {confirm === "restart"
                ? t("Argus pulls the new commits into the resources folder and restarts the server. Players are disconnected for a moment.")
                : t("Argus pulls the new commits into the resources folder. Running resources keep the old code until they or the server restart.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" autoFocus className="h-8 rounded-lg px-3">
                {t("Cancel")}
              </Button>
            </DialogClose>
            <Button
              onClick={() => {
                const restart = confirm === "restart"
                setConfirm(null)
                void apply(restart)
              }}
              className="h-8 rounded-lg px-3"
            >
              {t("Update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
