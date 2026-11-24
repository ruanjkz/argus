"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Loading03Icon, PlayIcon, RotateLeft01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { useDeploys, type DeployView } from "@/components/deploys-store"
import { ACTION_BUTTON, DetailRows, Section } from "@/components/detail-parts"
import { useLiveServer } from "@/components/live-server"
import { TextSwap } from "@/components/motion-primitives"
import { useSettings } from "@/components/settings-store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CONSOLE_END_SECONDS } from "@/lib/console-data"
import { lineTotals, STEP_LABEL, type DeployStep, type ResourceChange } from "@/lib/deploys"
import { formatAgo } from "@/lib/mock"
import { nextRestartTime } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

import { DEPLOY_STATUS } from "./deploy-status"

type Confirm = "apply" | "rollback" | null

export function DeployDetail({ deploy }: { deploy: DeployView }) {
  const { applyNow, cancel, rollback, building, applying } = useDeploys()
  const live = useLiveServer()
  const { restartTimes } = useSettings().settings
  const [confirm, setConfirm] = useState<Confirm>(null)
  const status = DEPLOY_STATUS[deploy.status]
  const totals = lineTotals(deploy.changes)
  const nextRestart = nextRestartTime(restartTimes, CONSOLE_END_SECONDS)
  const online = live.status === "online"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 px-4 py-3.5">
        <p className={cn("flex items-center gap-1.5 text-[11px]", status.text)}>
          <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} />
          <TextSwap text={status.label} />
        </p>
        <h2 className="mt-1.5 text-sm font-semibold text-pretty wrap-break-word">{deploy.message}</h2>
        <p className="mt-1 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
          {`${deploy.commit}  ${deploy.branch}  ${deploy.author}  ${formatAgo(deploy.ageSeconds)}`}
        </p>
        {deploy.status === "staged" || deploy.status === "superseded" ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {deploy.status === "staged" ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirm("apply")}
                  disabled={!online || applying}
                  className={cn(ACTION_BUTTON, "bg-primary text-primary-foreground hover:bg-primary/85")}
                >
                  <HugeiconsIcon icon={applying ? Loading03Icon : PlayIcon} strokeWidth={1.75} className={cn("size-3.5", applying && "animate-spin motion-reduce:animate-none")} />
                  {applying ? "Applying" : "Apply now"}
                </button>
                <button type="button" onClick={() => cancel(deploy.id)} disabled={applying} className={cn(ACTION_BUTTON, "hover:bg-muted")}>
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} className="size-3.5" />
                  {t("Cancel")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirm("rollback")}
                disabled={building}
                className={cn(ACTION_BUTTON, "border border-border hover:bg-muted")}
              >
                <HugeiconsIcon icon={RotateLeft01Icon} strokeWidth={1.75} className="size-3.5" />
                Roll back to this
              </button>
            )}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-6">
          {deploy.status === "staged" ? (
            <div className="rounded-xl bg-info/10 px-3 py-2.5 text-xs">
              <p className="font-medium text-info">Waiting for a restart</p>
              <p className="mt-1 text-foreground/90">
                {nextRestart
                  ? `Goes live at the scheduled restart at ${nextRestart}, or now if you apply it.`
                  : "No restart is scheduled. Apply it now, or restart the server when it suits you."}
              </p>
            </div>
          ) : null}
          {deploy.status === "failed" && deploy.failure ? (
            <div className="rounded-xl bg-destructive/10 px-3 py-2.5 text-xs">
              <p className="font-medium text-destructive">The test boot failed. Players never saw this code.</p>
              <p className="mt-1 font-mono text-[11px] wrap-break-word text-foreground/90">{deploy.failure}</p>
              <p className="mt-1.5 text-muted-foreground">Fix it in the repository and push again. Argus picks up the next commit.</p>
            </div>
          ) : null}
          {deploy.status === "cancelled" && deploy.failure ? (
            <p className="rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">{deploy.failure}.</p>
          ) : null}
          {deploy.rollbackOf ? (
            <p className="rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
              Undoes the changes from <span className="font-mono text-foreground/90">{deploy.rollbackOf}</span>.
            </p>
          ) : null}

          <Section title="Steps" meta={`${deploy.steps.filter((step) => step.status === "done").length}/${deploy.steps.length}`}>
            <ol className="flex flex-col" aria-live="polite">
              {deploy.steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </ol>
          </Section>

          <Section title="Changes" meta={`${totals.files} files  +${totals.added} -${totals.removed}`}>
            <ChangeList changes={deploy.changes} />
          </Section>

          <Section title="Details">
            <DetailRows
              rows={[
                ["Commit", deploy.commit],
                ["Branch", deploy.branch],
                ["Author", deploy.author],
                ["Pulled", formatAgo(deploy.ageSeconds)],
                ["Went live", deploy.appliedAgo === null ? "—" : formatAgo(deploy.appliedAgo)],
              ]}
            />
          </Section>
        </div>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{confirm === "apply" ? `Apply ${deploy.commit} now?` : `Roll back to ${deploy.commit}?`}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {confirm === "apply"
                ? `The server restarts right away and ${live.players} ${live.players === 1 ? "player is" : "players are"} disconnected. They can rejoin in a few seconds.`
                : "Argus builds the old code again and test boots it. It goes live at the next restart, like any deploy."}
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
                if (confirm === "apply") applyNow(deploy.id)
                else rollback(deploy.id)
                setConfirm(null)
              }}
              className="h-8 rounded-lg px-3"
            >
              {confirm === "apply" ? "Restart and apply" : "Stage rollback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StepRow({ step }: { step: DeployStep }) {
  return (
    <li className="flex h-8 items-center gap-2.5 px-2 text-xs">
      <span className="grid size-4 shrink-0 place-items-center">
        {step.status === "done" ? (
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5 text-success" />
        ) : step.status === "running" ? (
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.75} className="size-3.5 animate-spin text-foreground/80 motion-reduce:animate-none" />
        ) : step.status === "failed" ? (
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5 text-destructive" />
        ) : (
          <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        )}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", step.status === "pending" || step.status === "skipped" ? "text-muted-foreground" : "text-foreground/90")}>
        {STEP_LABEL[step.id]}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[11px]",
          step.status === "failed" ? "text-destructive/80" : "text-muted-foreground",
        )}
      >
        {step.status === "skipped" ? "skipped" : (step.detail ?? "")}
      </span>
    </li>
  )
}

const KIND_LABEL = { changed: "changed", added: "new", removed: "removed" }

function ChangeList({ changes }: { changes: ResourceChange[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {changes.map((change) => (
        <li key={change.resource}>
          <div className="flex items-baseline gap-2 px-2">
            <span className="truncate font-mono text-[12px] text-foreground/90">{change.resource}</span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">{change.folder}</span>
            <span
              className={cn(
                "ml-auto shrink-0 text-[11px]",
                change.kind === "added" ? "text-success" : change.kind === "removed" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {KIND_LABEL[change.kind]}
            </span>
          </div>
          <ul className="mt-1 flex flex-col">
            {change.files.map((file) => (
              <li key={file.path} className="flex h-7 items-center gap-3 rounded-lg px-2 font-mono text-[11px] hover:bg-muted/60">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{file.path}</span>
                <span className="shrink-0 text-success tabular-nums">{`+${file.added}`}</span>
                <span className="w-8 shrink-0 text-right text-destructive tabular-nums">{`-${file.removed}`}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
