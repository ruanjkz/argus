"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, AlertCircleIcon, PackageIcon, PlayIcon, RefreshIcon, StopIcon } from "@hugeicons/core-free-icons"

import { useConsole } from "@/components/console-store"
import { ACTION_BUTTON, DetailRows, Section } from "@/components/detail-parts"
import { IncidentOriginText } from "@/components/incident-origin"
import { useLiveServer } from "@/components/live-server"
import { TextSwap } from "@/components/motion-primitives"
import { useResources, type ResourceView } from "@/components/resources-store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatAgo } from "@/lib/mock"
import { formatCpu, formatMemory, TICK_BUDGET_MS } from "@/lib/resources"
import { cn } from "@/lib/utils"

import { isBusy, RESOURCE_STATUS } from "./status"

const RUNTIME_LABEL = { lua: "Lua", javascript: "JavaScript" }

function listNames(names: string[]) {
  if (names.length <= 1) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

export function ResourceDetail({
  resource,
  onSelect,
  onEnsureFolder,
}: {
  resource: ResourceView
  onSelect: (name: string) => void
  onEnsureFolder: (folder: string) => void
}) {
  const { byName, resources, serverOnline } = useResources()
  const folderSize = resources.filter((entry) => entry.folder === resource.folder).length
  const consoleStore = useConsole()
  const live = useLiveServer()
  const [confirmStop, setConfirmStop] = useState(false)
  const status = RESOURCE_STATUS[resource.status]
  const busy = isBusy(resource)
  const running = resource.status === "started"
  const runningDependents = resource.dependents.filter((name) => byName.get(name)?.status === "started")
  const incidents = live.incidents.filter((incident) => incident.resource === resource.name)
  const share = (resource.liveCpuMs / TICK_BUDGET_MS) * 100

  function run(command: "start" | "ensure" | "stop") {
    consoleStore.run(`${command} ${resource.name}`)
    live.logAction(`ran ${command} ${resource.name}`)
  }

  function requestStop() {
    if (runningDependents.length) setConfirmStop(true)
    else run("stop")
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <HugeiconsIcon icon={PackageIcon} strokeWidth={1.75} className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-mono text-sm font-medium">{resource.name}</h2>
            <p className={cn("mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px]", status.text)}>
              <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} />
              <TextSwap text={status.label} />
            </p>
          </div>
        </div>
        <p className="mt-2.5 text-xs text-pretty text-muted-foreground">{resource.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {running || resource.status === "stopping" ? (
            <button
              type="button"
              onClick={() => run("ensure")}
              disabled={!serverOnline || busy}
              className={cn(ACTION_BUTTON, "border border-border hover:bg-muted")}
            >
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} className="size-3.5" />
              Restart
            </button>
          ) : (
            <button
              type="button"
              onClick={() => run("start")}
              disabled={!serverOnline || busy}
              className={cn(ACTION_BUTTON, "bg-primary text-primary-foreground hover:bg-primary/85")}
            >
              <HugeiconsIcon icon={PlayIcon} strokeWidth={1.75} className="size-3.5" />
              {resource.status === "failed" ? "Try again" : "Start"}
            </button>
          )}
          {resource.required ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <button type="button" disabled className={cn(ACTION_BUTTON, "text-destructive")}>
                    <HugeiconsIcon icon={StopIcon} strokeWidth={1.75} className="size-3.5" />
                    Stop
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Argus needs this resource to watch the server</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={requestStop}
              disabled={!serverOnline || !running}
              className={cn(ACTION_BUTTON, "text-destructive hover:bg-destructive/10")}
            >
              <HugeiconsIcon icon={StopIcon} strokeWidth={1.75} className="size-3.5" />
              Stop
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-6">
          {resource.status === "failed" && resource.failure ? (
            <div className="rounded-xl bg-destructive/10 px-3 py-2.5 text-xs">
              <p className="font-medium text-destructive">Failed to start</p>
              <p className="mt-1 wrap-break-word text-foreground/90">{resource.failure}</p>
              {resource.missingDependencies.length ? (
                <p className="mt-1.5 text-muted-foreground">
                  Install {listNames(resource.missingDependencies)} in the resources folder, or remove it from the dependencies in fxmanifest.lua.
                </p>
              ) : null}
            </div>
          ) : null}

          {incidents.length ? (
            <Section title="Problems" meta={`${incidents.length} open`}>
              <ul className="flex flex-col gap-0.5">
                {incidents.map((incident) => (
                  <li key={incident.id} className="flex gap-3 rounded-lg px-2 py-2">
                    <HugeiconsIcon
                      icon={incident.kind === "error" ? AlertCircleIcon : Alert02Icon}
                      strokeWidth={1.75}
                      className={cn("mt-0.5 size-4 shrink-0", incident.kind === "error" ? "text-destructive" : "text-warning")}
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="wrap-break-word text-foreground/90">{incident.message}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{incident.location}</p>
                      <p className="mt-1 text-muted-foreground">{incident.explanation.fix}</p>
                      {incident.introducedBy ? (
                        <p className={cn("mt-1", incident.introducedBy.uncommitted ? "text-warning" : "text-muted-foreground")}>
                          {incident.introducedBy.uncommitted ? null : "Since "}
                          <IncidentOriginText origin={incident.introducedBy} />
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
                      <span className="block text-foreground/80">{incident.count}×</span>
                      {formatAgo(incident.lastSeen)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Performance" meta={running && resource.liveCpuMs >= 0 ? `${share.toFixed(1)}% of the ${TICK_BUDGET_MS} ms tick` : undefined}>
            <DetailRows
              rows={[
                ["Server tick", running ? formatCpu(resource.liveCpuMs) : "—"],
                ["Memory", running ? formatMemory(resource.memoryKb) : "—"],
                ["Scripts", `${resource.serverScripts} server  ${resource.clientScripts} client`],
              ]}
            />
          </Section>

          <Section title="Depends on" meta={`${resource.dependencies.length}`}>
            <ResourceLinks names={resource.dependencies} empty="This resource has no dependencies." onSelect={onSelect} />
          </Section>

          <Section title="Used by" meta={`${resource.dependents.length}`}>
            <ResourceLinks names={resource.dependents} empty="No other resource depends on this one." onSelect={onSelect} />
          </Section>

          <Section title="Folder" meta={resource.folder}>
            <div className="flex items-center justify-between gap-3 px-2">
              <p className="min-w-0 text-xs text-muted-foreground">
                {folderSize === 1 ? "Only resource in this folder." : `Shares the folder with ${folderSize - 1} other ${folderSize === 2 ? "resource" : "resources"}.`}
              </p>
              <button
                type="button"
                onClick={() => onEnsureFolder(resource.folder)}
                disabled={!serverOnline}
                className={cn(ACTION_BUTTON, "shrink-0 border border-border font-mono hover:bg-muted")}
              >
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} className="size-3.5" />
                {`ensure ${resource.folder}`}
              </button>
            </div>
          </Section>

          <Section title="Manifest">
            <DetailRows
              rows={[
                ["Version", resource.version],
                ["Runtime", RUNTIME_LABEL[resource.runtime]],
                ["Path", `resources/${resource.folder}/${resource.name}`],
              ]}
            />
          </Section>
        </div>
      </div>

      <Dialog open={confirmStop} onOpenChange={setConfirmStop}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold wrap-anywhere">Stop {resource.name}?</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {listNames(runningDependents)} {runningDependents.length === 1 ? "depends" : "depend"} on it. They keep running, but calls into{" "}
              {resource.name} fail until it starts again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" autoFocus className="h-8 rounded-lg px-3">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={() => {
                setConfirmStop(false)
                run("stop")
              }}
              className="h-8 rounded-lg bg-destructive px-3 text-white hover:bg-destructive/85 dark:text-white"
            >
              Stop resource
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ResourceLinks({ names, empty, onSelect }: { names: string[]; empty: string; onSelect: (name: string) => void }) {
  const { byName } = useResources()
  if (names.length === 0) return <p className="px-2 text-xs text-muted-foreground">{empty}</p>
  return (
    <ul className="flex flex-col">
      {names.map((name) => {
        const other = byName.get(name)
        if (!other) {
          return (
            <li key={name} className="flex h-8 items-center gap-3 px-2 text-xs">
              <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/90">{name}</span>
              <span className="text-[11px] text-destructive">not installed</span>
            </li>
          )
        }
        const status = RESOURCE_STATUS[other.status]
        return (
          <li key={name}>
            <button
              type="button"
              onClick={() => onSelect(name)}
              className="flex h-8 w-full items-center gap-3 rounded-lg px-2 text-left text-xs outline-none transition-colors hover:bg-muted/60 active:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/90">{name}</span>
              <span className={cn("text-[11px]", status.text)}>{status.label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
