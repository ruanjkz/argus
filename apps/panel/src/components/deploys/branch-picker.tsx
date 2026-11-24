"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { GitBranchIcon, UnfoldMoreIcon } from "@hugeicons/core-free-icons"

import { useDeploys } from "@/components/deploys-store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BRANCHES } from "@/lib/deploys"
import { formatAgo } from "@/lib/mock"

export function BranchPicker() {
  const { branch, building, drift, switchBranch } = useDeploys()
  const [target, setTarget] = useState<string | null>(null)
  const targetInfo = BRANCHES.find((entry) => entry.name === target)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={building}
            aria-label={`Branch ${branch}. Switch branch`}
            className="press inline-flex h-8 max-w-40 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 aria-expanded:bg-muted"
          >
            <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.75} className="size-3.5 shrink-0" />
            <span className="truncate font-mono">{branch}</span>
            <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={1.75} className="size-3 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 rounded-xl">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Deploy from branch</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={branch} onValueChange={(name) => name !== branch && setTarget(name)}>
            {BRANCHES.map((entry) => (
              <DropdownMenuRadioItem key={entry.name} value={entry.name} className="items-start py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">{entry.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{entry.message}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{formatAgo(entry.ageSeconds)}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold wrap-anywhere">
              Deploy from {target} instead of {branch}?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {targetInfo ? `Argus builds ${targetInfo.commit} and test boots it. ` : null}
              The live server keeps its current code until the next restart, and new commits are pulled from {target} from now on.
              {drift.length ? ` The ${drift.length === 1 ? "file" : `${drift.length} files`} edited on the server may be overwritten.` : null}
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
                if (target) switchBranch(target)
                setTarget(null)
              }}
              className="h-8 rounded-lg px-3"
            >
              Switch branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
