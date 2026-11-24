"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"

import { useDeploys } from "@/components/deploys-store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { changedPaths } from "@/lib/deploys"
import { formatAgo } from "@/lib/mock"
import { cn } from "@/lib/utils"

const STATE_LABEL = { modified: "edited", added: "added", deleted: "deleted", untracked: "new file" }

export function DriftPanel() {
  const { drift, deploys, discardDrift } = useDeploys()
  const [open, setOpen] = useState(true)
  const [confirming, setConfirming] = useState(false)
  if (drift.length === 0) return null

  const staged = deploys.find((deploy) => deploy.status === "staged")
  const overwritten = staged ? changedPaths(staged.changes) : new Set<string>()
  const conflicts = drift.filter((entry) => overwritten.has(entry.path)).length
  const resources = [...new Set(drift.map((entry) => entry.resource))]

  return (
    <section aria-label="Edited on the server" className="border-b border-border/70 bg-warning/5">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 text-xs">
          <p className="font-medium text-foreground/90">
            {drift.length === 1 ? "1 file was edited on the server" : `${drift.length} files were edited on the server`}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {`In ${resources.join(" and ")}. These edits are not in the repository`}
            {conflicts && staged ? `, and ${staged.commit} overwrites ${conflicts === 1 ? "1 of them" : `${conflicts} of them`} when it goes live.` : "."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="press inline-flex h-8 shrink-0 items-center rounded-lg border border-border px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          Discard edits
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? "Hide the edited files" : "Show the edited files"}
          className="press grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={1.75}
            className={cn("size-4 transition-transform duration-200 ease-out motion-reduce:transition-none", open && "rotate-180")}
          />
        </button>
      </div>
      {open ? (
        <ul className="px-4 pb-2.5">
          {drift.map((entry) => {
            const conflict = overwritten.has(entry.path)
            return (
              <li key={entry.path} className="flex h-7 items-center gap-3 font-mono text-[11px]">
                <span className="min-w-0 flex-1 truncate text-foreground/85">{entry.path}</span>
                {conflict ? <span className="shrink-0 font-sans text-warning">overwritten by the staged deploy</span> : null}
                <span className="w-14 shrink-0 text-right font-sans text-muted-foreground">{STATE_LABEL[entry.state]}</span>
                <span className="hidden w-14 shrink-0 text-right text-muted-foreground tabular-nums sm:inline">{formatAgo(entry.editedSecondsAgo)}</span>
              </li>
            )
          })}
        </ul>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {drift.length === 1 ? "Discard the edit made on the server?" : `Discard ${drift.length} edits made on the server?`}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Every file goes back to the last commit and new files are deleted. This cannot be undone. To keep an edit, copy it into the
              repository first.
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
                discardDrift()
                setConfirming(false)
              }}
              className="h-8 rounded-lg bg-destructive px-3 text-white hover:bg-destructive/85 dark:text-white"
            >
              Discard edits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
