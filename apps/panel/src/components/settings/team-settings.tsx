"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Alert02Icon } from "@hugeicons/core-free-icons"

import { agentCall, useAgent, type AgentAccount, type AgentRole } from "@/components/agent-store"
import { CopyButton } from "@/components/detail-parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatAgo } from "@/lib/mock"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

const ROLE_LABEL: Record<AgentRole, string> = { owner: "Owner", admin: "Admin", moderator: "Moderator" }

const ROLE_HINT: Record<AgentRole, string> = {
  owner: t("Everything, including settings, the repository and remote access."),
  admin: t("Starts and stops the server, runs any command, manages moderators."),
  moderator: t("Watches the console, and can say, kick and check status."),
}

const SMALL =
  "press inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

type Created = { account: AgentAccount; temporaryPassword: string }

function canManage(actor: AgentRole, role: AgentRole) {
  return actor === "owner" ? role !== "owner" : actor === "admin" ? role === "moderator" : false
}

export function TeamSettings() {
  const { account, mode } = useAgent()
  const [accounts, setAccounts] = useState<AgentAccount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const [removing, setRemoving] = useState<AgentAccount | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const live = mode === "live"
  const actorRole = account?.role ?? "moderator"

  const load = useCallback(() => {
    agentCall<AgentAccount[]>("GET", "accounts")
      .then((list) => {
        setAccounts(list)
        setLoadedAt(Date.now())
      })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : t("Could not load the team")))
  }, [])

  useEffect(() => {
    if (live && actorRole !== "moderator") load()
  }, [live, actorRole, load])

  async function act(run: () => Promise<unknown>) {
    setError(null)
    try {
      await run()
      load()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("That did not work"))
    }
  }

  return (
    <section id="section-team" aria-labelledby="section-team-title" className="scroll-mt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="section-team-title" className="text-sm font-semibold">
            {t("Team")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("Logins for your staff. New members pick their own password on the first sign in.")}</p>
        </div>
        {live && actorRole !== "moderator" ? (
          <button type="button" onClick={() => setAdding(true)} className={cn(SMALL, "shrink-0 border border-border hover:bg-muted")}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} className="size-3.5" />
            {t("Add member")}
          </button>
        ) : null}
      </div>

      {!live ? (
        <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-xs text-muted-foreground">{t("Start Argus to manage the team.")}</p>
      ) : actorRole === "moderator" ? (
        <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-xs text-muted-foreground">{t("Only admins and the owner manage the team.")}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border/60 rounded-xl border border-border/70">
          {accounts.map((member) => {
            const self = member.id === account?.id
            const manageable = !self && canManage(actorRole, member.role)
            return (
              <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                <span className={cn("size-1.5 shrink-0 rounded-full", member.disabled ? "bg-muted-foreground/40" : "bg-success")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground/90">
                    {member.username}
                    {self ? <span className="ml-1.5 text-xs text-muted-foreground">{t("you")}</span> : null}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {member.disabled
                      ? t("Access turned off")
                      : member.mustChangePassword
                        ? t("Has not picked a password yet")
                        : member.lastLoginAt
                          ? t("Last sign in {ago}", { ago: formatAgo(Math.max(0, Math.floor((loadedAt - member.lastLoginAt) / 1000))) })
                          : t("Never signed in")}
                  </p>
                </div>
                {manageable ? (
                  <select
                    aria-label={t("Role of {name}", { name: member.username })}
                    value={member.role}
                    onChange={(event) => void act(() => agentCall("PUT", "accounts", { id: member.id, role: event.target.value }))}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {(["admin", "moderator"] as const)
                      .filter((role) => canManage(actorRole, role))
                      .map((role) => (
                        <option key={role} value={role}>
                          {t(ROLE_LABEL[role])}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">{t(ROLE_LABEL[member.role])}</span>
                )}
                {manageable ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        void act(async () => setCreated(await agentCall<Created>("POST", "accounts/reset", { id: member.id })))
                      }
                      className={cn(SMALL, "hover:bg-muted")}
                    >
                      {t("Reset password")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void act(() => agentCall("PUT", "accounts", { id: member.id, disabled: !member.disabled }))}
                      className={cn(SMALL, "hover:bg-muted")}
                    >
                      {member.disabled ? t("Turn on") : t("Turn off")}
                    </button>
                    <button type="button" onClick={() => setRemoving(member)} className={cn(SMALL, "text-destructive hover:bg-destructive/10")}>
                      {t("Remove")}
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <AddMemberDialog
        open={adding}
        actorRole={actorRole}
        onClose={() => setAdding(false)}
        onCreated={(result) => {
          setAdding(false)
          setCreated(result)
          load()
        }}
      />
      <TemporaryPasswordDialog created={created} onClose={() => setCreated(null)} />

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{t("Remove {name}?", { name: removing?.username ?? "" })}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("They are signed out right away and cannot sign in again. To pause access instead, use Turn off.")}
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
                const target = removing
                setRemoving(null)
                if (target) void act(() => agentCall("POST", "accounts/remove", { id: target.id }))
              }}
              className="h-8 rounded-lg bg-destructive px-3 text-white hover:bg-destructive/85 dark:text-white"
            >
              {t("Remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function AddMemberDialog({
  open,
  actorRole,
  onClose,
  onCreated,
}: {
  open: boolean
  actorRole: AgentRole
  onClose: () => void
  onCreated: (created: Created) => void
}) {
  const roles = (["admin", "moderator"] as const).filter((role) => canManage(actorRole, role))
  const [username, setUsername] = useState("")
  const [role, setRole] = useState<AgentRole>("moderator")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await agentCall<Created>("POST", "accounts", { username, role })
      setUsername("")
      onCreated(created)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Could not create the login"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent showCloseButton={false} className="rounded-2xl p-5 sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{t("Add a team member")}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("Argus makes a temporary password. Send it to them privately; they choose their own on the first sign in.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="member-username" className="text-xs font-medium">
              {t("Username")}
            </label>
            <input
              id="member-username"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s/g, ""))}
              autoFocus
              spellCheck={false}
              autoCapitalize="none"
              placeholder="lia.mod"
              className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </div>
          <div className="grid gap-1.5" role="radiogroup" aria-label={t("Role")}>
            <span className="text-xs font-medium">{t("Role")}</span>
            {roles.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5",
                  role === option ? "border-foreground/40 bg-muted" : "border-border",
                )}
              >
                <input type="radio" name="member-role" checked={role === option} onChange={() => setRole(option)} className="mt-0.5 accent-foreground" />
                <span>
                  <span className="block text-sm">{t(ROLE_LABEL[option])}</span>
                  <span className="block text-xs text-muted-foreground">{t(ROLE_HINT[option])}</span>
                </span>
              </label>
            ))}
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="h-8 rounded-lg px-3">
                {t("Cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || username.length < 2} className="h-8 rounded-lg px-3">
              {t("Create login")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TemporaryPasswordDialog({ created, onClose }: { created: Created | null; onClose: () => void }) {
  return (
    <Dialog open={created !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="rounded-2xl p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">{t("Send this to {name}", { name: created?.account.username ?? "" })}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t("Argus shows this password only once. They will be asked to replace it right after signing in.")}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="grid gap-2 rounded-xl bg-muted p-3 text-sm">
            <div className="group flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t("Username")}</span>
              <span className="flex items-center gap-1 font-mono">
                {created.account.username}
                <CopyButton value={created.account.username} label={t("Copy the username")} />
              </span>
            </div>
            <div className="group flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t("Temporary password")}</span>
              <span className="flex items-center gap-1 font-mono">
                {created.temporaryPassword}
                <CopyButton value={created.temporaryPassword} label={t("Copy the password")} />
              </span>
            </div>
            <div className="group flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{t("Address")}</span>
              <span className="flex min-w-0 items-center gap-1 font-mono text-xs">
                <span className="truncate">{typeof window === "undefined" ? "" : window.location.origin}</span>
                <CopyButton value={typeof window === "undefined" ? "" : window.location.origin} label={t("Copy the address")} />
              </span>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button autoFocus className="h-8 rounded-lg px-3">
              {t("Done")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
