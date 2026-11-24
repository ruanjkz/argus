"use client"

import { useEffect, useState } from "react"

import { agentCall, useAgent } from "@/components/agent-store"
import { t } from "@/lib/i18n"

type Release = { current: string; latest: string | null; newer: boolean; url: string | null }

export function VersionBadge() {
  const { mode } = useAgent()
  const [release, setRelease] = useState<Release | null>(null)
  const live = mode === "live"

  useEffect(() => {
    if (!live) return
    agentCall<Release>("GET", "version")
      .then(setRelease)
      .catch(() => undefined)
  }, [live])

  const current = release?.current ?? "0.1.0"

  if (release?.newer && release.latest && release.url) {
    return (
      <a
        href={release.url}
        target="_blank"
        rel="noreferrer"
        title={t("Argus {version} is out. You have {current}.", { version: release.latest, current })}
        className="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px] text-foreground/90 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="size-1.5 rounded-full bg-info" aria-hidden />
        {t("Update to {version}", { version: release.latest.replace(/^v/, "") })}
      </a>
    )
  }

  return <span className="font-mono text-[11px] text-muted-foreground/60">v{current}</span>
}
