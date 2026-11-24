"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { GitBranchIcon, Loading03Icon, RefreshIcon } from "@hugeicons/core-free-icons"

import { useAgent } from "@/components/agent-store"
import { useDeploys, type DeployView } from "@/components/deploys-store"
import { IconSwap } from "@/components/motion-primitives"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { lineTotals, REPOSITORY } from "@/lib/deploys"
import { formatAgo } from "@/lib/mock"
import { useIsDesktop } from "@/lib/use-is-desktop"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

import { DeployDetail } from "./deploy-detail"
import { BranchPicker } from "./branch-picker"
import { ConnectWizard } from "./connect-wizard"
import { LiveDeploys } from "./live-deploys"
import { DEPLOY_STATUS } from "./deploy-status"
import { DriftPanel } from "./drift-panel"

export function DeploysPage() {
  const { deploys, byId, building, branch, connection, check } = useDeploys()
  const agentLive = useAgent().mode === "live"
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const noteTimer = useRef<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const desktop = useIsDesktop()

  useEffect(() => () => {
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current)
  }, [])

  const newestId = deploys[0]?.id ?? null
  const [seenNewest, setSeenNewest] = useState(newestId)
  if (seenNewest !== newestId) {
    setSeenNewest(newestId)
    if (deploys[0]?.status === "building") setSelectedId(newestId)
  }

  const liveDeploy = deploys.find((deploy) => deploy.status === "live")
  const staged = deploys.find((deploy) => deploy.status === "staged")
  const effectiveId = selectedId && byId.has(selectedId) ? selectedId : desktop ? (deploys[0]?.id ?? null) : null
  const selected = effectiveId ? byId.get(effectiveId) : undefined

  function select(id: string) {
    setSelectedId(id)
    if (!desktop) setSheetOpen(true)
  }

  function runCheck() {
    const result = check()
    if (result === "started") {
      setSelectedId(null)
      setNote(null)
      return
    }
    setNote(result === "busy" ? "A deploy is already building." : `Already up to date with origin/${branch}.`)
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => setNote(null), 2600)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const index = deploys.findIndex((deploy) => deploy.id === effectiveId)
    const next = deploys[event.key === "ArrowDown" ? Math.min(deploys.length - 1, index + 1) : Math.max(0, index - 1)]
    if (!next) return
    select(next.id)
    listRef.current?.querySelector<HTMLButtonElement>(`[data-deploy-id="${next.id}"]`)?.focus()
  }

  if (agentLive) return <LiveDeploys />

  if (!connection) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="border-b border-border/70 px-5 py-3">
          <h1 className="truncate text-sm font-semibold">{t("Deploys")}</h1>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{t("no repository connected")}</p>
        </header>
        <div className="min-h-0 flex-1">
          <ConnectWizard />
        </div>
      </div>
    )
  }


  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{t("Deploys")}</h1>
          <p className="mt-0.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">
            {`${connection.sshUrl}  ${branch}  live ${liveDeploy?.commit ?? "none"}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {note ? (
            <span role="status" className="hidden text-xs text-muted-foreground sm:inline">
              {note}
            </span>
          ) : null}
          <BranchPicker />
          <button
            type="button"
            onClick={runCheck}
            disabled={building}
            className="press inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
          >
            <IconSwap
              active={building ? "b" : "a"}
              first={<HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} className="size-3.5" />}
              second={<HugeiconsIcon icon={Loading03Icon} strokeWidth={1.75} className={cn("size-3.5", building && "animate-spin motion-reduce:animate-none")} />}
            />
            {building ? "Building" : t("Check for updates")}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col lg:border-r lg:border-border/70">
          <div className="border-b border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
            {staged ? (
              <p>
                <span className="font-mono text-info">{staged.commit}</span> is staged and goes live at the next restart. The live server keeps running{" "}
                <span className="font-mono text-foreground/80">{liveDeploy?.commit ?? "its current code"}</span> until then.
              </p>
            ) : (
              <p>
                Argus pulls {branch}, test boots it on port {REPOSITORY.stagingPort}, and only swaps the resources folder at a restart.
              </p>
            )}
          </div>
          <DriftPanel />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul ref={listRef} onKeyDown={handleKeyDown} className="divide-y divide-border/50" aria-label={t("Deploys")}>
              {deploys.map((deploy, index) => (
                <DeployRow
                  key={deploy.id}
                  deploy={deploy}
                  selected={deploy.id === effectiveId}
                  focusable={deploy.id === effectiveId || (!effectiveId && index === 0)}
                  onSelect={select}
                />
              ))}
            </ul>
          </div>
        </div>

        {desktop ? (
          <aside aria-label="Deploy details" className="hidden w-[26rem] shrink-0 lg:block">
            {selected ? (
              <DeployDetail key={selected.id} deploy={selected} />
            ) : (
              <div className="px-6 pt-[14vh] text-center text-xs text-muted-foreground">Pick a deploy to see its steps and changes.</div>
            )}
          </aside>
        ) : null}
      </div>

      {!desktop ? (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
            <SheetTitle className="sr-only">{selected ? `Deploy ${selected.commit}` : "Deploy"}</SheetTitle>
            {selected ? <DeployDetail key={selected.id} deploy={selected} /> : null}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}

function DeployRow({
  deploy,
  selected,
  focusable,
  onSelect,
}: {
  deploy: DeployView
  selected: boolean
  focusable: boolean
  onSelect: (id: string) => void
}) {
  const status = DEPLOY_STATUS[deploy.status]
  const totals = lineTotals(deploy.changes)
  const resources = deploy.changes.map((change) => change.resource).join(", ")
  return (
    <li>
      <button
        type="button"
        data-deploy-id={deploy.id}
        onClick={() => onSelect(deploy.id)}
        tabIndex={focusable ? 0 : -1}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          selected && "bg-muted hover:bg-muted",
        )}
      >
        <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("truncate text-[13px]", deploy.status === "superseded" || deploy.status === "cancelled" ? "text-muted-foreground" : "text-foreground/90")}>
              {deploy.message}
            </span>
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] whitespace-pre text-muted-foreground">
            {`${deploy.commit}  ${deploy.author}  ${resources}`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className={cn("inline-flex items-center gap-1.5 text-[11px]", status.text)}>
            <span className={cn("size-1.5 rounded-full", status.dot)} aria-hidden />
            {status.label}
          </span>
          <span className="font-mono text-[11px] whitespace-pre text-muted-foreground tabular-nums">
            {`+${totals.added} -${totals.removed}  ${formatAgo(deploy.ageSeconds)}`}
          </span>
        </span>
      </button>
    </li>
  )
}
