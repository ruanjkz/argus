"use client"

import { useState } from "react"
import Link from "next/link"

import { useDeploys } from "@/components/deploys-store"
import { CopyButton } from "@/components/detail-parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DEPLOY_KEY_FINGERPRINT, DEPLOY_PUBLIC_KEY, hostName } from "@/lib/repository"
import { t } from "@/lib/i18n"

const LINK_BUTTON =
  "press inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"

export function RepositorySettings() {
  const { connection, branch, disconnect } = useDeploys()
  const [confirming, setConfirming] = useState(false)

  return (
    <section id="section-repository" aria-labelledby="section-repository-title" className="scroll-mt-6">
      <h2 id="section-repository-title" className="text-sm font-semibold">
        {t("Repository")}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("Where Argus pulls your resources from.")}</p>

      {connection ? (
        <div className="mt-4 rounded-xl border border-border/70">
          <div className="flex items-center gap-3 px-3 py-3">
            <span className="size-1.5 shrink-0 rounded-full bg-success" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[13px] text-foreground/90">{`${connection.owner}/${connection.name}`}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {t("Connected on {host}, deploying {branch}", { host: hostName(connection), branch })}
              </p>
            </div>
            <Link href="/deploys" className={LINK_BUTTON}>
              {t("Open deploys")}
            </Link>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="press inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("Disconnect")}
            </button>
          </div>
          <div className="group flex items-center gap-3 border-t border-border/60 px-3 py-2">
            <span className="shrink-0 text-xs text-muted-foreground">{t("Deploy key")}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/85">{DEPLOY_KEY_FINGERPRINT}</span>
            <CopyButton value={DEPLOY_PUBLIC_KEY} label={t("Copy the public key")} />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted px-3 py-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t("No repository connected. Deploys, rollbacks and the commit behind each error need one.")}
          </p>
          <Link href="/deploys" className={LINK_BUTTON}>
            {t("Connect a repository")}
          </Link>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold wrap-anywhere">
              {t("Disconnect {name}?", { name: connection ? `${connection.owner}/${connection.name}` : "" })}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              The resources folder stays exactly as it is and the server keeps running. Argus stops pulling new commits until you connect
              again. Remove the deploy key on the repository if you no longer need it.
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
                disconnect()
                setConfirming(false)
              }}
              className="h-8 rounded-lg bg-destructive px-3 text-white hover:bg-destructive/85 dark:text-white"
            >
              {t("Disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
