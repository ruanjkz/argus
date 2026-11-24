"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Key01Icon, Logout03Icon, UserIcon } from "@hugeicons/core-free-icons"

import { useAgent } from "@/components/agent-store"
import { ChangePasswordForm } from "@/components/auth/auth-screens"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { t } from "@/lib/i18n"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const ROLE_LABEL = { owner: "Owner", admin: "Admin", moderator: "Moderator" }

export function UserMenu() {
  const { account, signOut } = useAgent()
  const [changing, setChanging] = useState(false)
  const [changed, setChanged] = useState(false)
  if (!account) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center gap-2.5 rounded-xl px-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted font-mono text-[11px] uppercase">
              {account.username.slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground/90">{account.username}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{t(ROLE_LABEL[account.role])}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56 rounded-xl">
          <DropdownMenuLabel className="flex items-center gap-2 text-[11px] font-normal text-muted-foreground">
            <HugeiconsIcon icon={UserIcon} strokeWidth={1.75} className="size-3.5" />
            {t("Signed in as {name}", { name: account.username })}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setChanged(false)
              setChanging(true)
            }}
          >
            <HugeiconsIcon icon={Key01Icon} strokeWidth={1.75} className="size-4" />
            {t("Change password")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void signOut()}>
            <HugeiconsIcon icon={Logout03Icon} strokeWidth={1.75} className="size-4" />
            {t("Sign out")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={changing} onOpenChange={setChanging}>
        <DialogContent className="rounded-2xl p-5 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{t("Change your password")}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {changed ? t("Done. Your other devices were signed out.") : t("Your other devices are signed out when you save.")}
            </DialogDescription>
          </DialogHeader>
          {changed ? null : <ChangePasswordForm forced={false} onDone={() => setChanged(true)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
