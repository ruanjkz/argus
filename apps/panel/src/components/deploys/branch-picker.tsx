"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { GitBranchIcon, Search01Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons"

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
import { t } from "@/lib/i18n"

export function BranchPicker() {
  const { branch, building, drift, switchBranch } = useDeploys()
  const [target, setTarget] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const targetInfo = BRANCHES.find((entry) => entry.name === target)
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? BRANCHES.filter(
        (entry) =>
          entry.name.toLowerCase().includes(needle) ||
          entry.message.toLowerCase().includes(needle) ||
          entry.author.toLowerCase().includes(needle) ||
          entry.commit.includes(needle),
      )
    : BRANCHES

  function pick(name: string) {
    setOpen(false)
    setQuery("")
    if (name !== branch) setTarget(name)
  }

  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery("")
        }}
      >
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
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">{t("Deploy from branch")}</DropdownMenuLabel>
          <label className="mx-1 mb-1 flex h-8 items-center gap-2 rounded-lg bg-muted px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} className="size-3.5 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches[0]) {
                  event.preventDefault()
                  pick(matches[0].name)
                  return
                }
                if (event.key !== "ArrowDown" && event.key !== "Escape" && event.key !== "Tab") event.stopPropagation()
              }}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder={t("Find a branch")}
              aria-label={t("Find a branch")}
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground"
            />
            {query ? <span className="font-mono text-[11px] tabular-nums">{matches.length}</span> : null}
          </label>
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-xs wrap-anywhere text-muted-foreground">No branch matches “{query.trim()}”.</p>
          ) : null}
          <DropdownMenuRadioGroup value={branch} onValueChange={pick} className="max-h-64 overflow-y-auto">
            {matches.map((entry) => (
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
                {t("Cancel")}
              </Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (target) switchBranch(target)
                setTarget(null)
              }}
              className="h-8 rounded-lg px-3"
            >
              {t("Switch branch")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
