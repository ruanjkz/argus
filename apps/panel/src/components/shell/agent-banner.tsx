"use client"

import { usePathname } from "next/navigation"

import { useAgent } from "@/components/agent-store"
import { cn } from "@/lib/utils"

const SAMPLE_PAGES: Record<string, string> = {
  "/players": "Players",
  "/bans": "Bans",
  "/resources": "Resources",
}

export function AgentBanner() {
  const { mode, reachable } = useAgent()
  const pathname = usePathname()
  const sample = Object.entries(SAMPLE_PAGES).find(([path]) => pathname.startsWith(path))?.[1]

  let text: string | null = null
  let tone: "muted" | "warning" = "muted"
  if (mode === "demo") {
    text = "Demo mode. The Argus agent is not running, so everything here is sample data. Run argus start to manage your server."
  } else if (mode === "live" && !reachable) {
    text = "Lost the connection to the Argus agent. Reconnecting…"
    tone = "warning"
  } else if (mode === "live" && sample) {
    text = `${sample} still shows sample data. This page is not wired to your server yet.`
  } else if (mode === "live" && pathname.startsWith("/deploys")) {
    text = "The repository connection is real. The deploy history and pipeline below are still sample data."
  }

  if (!text) return null
  return (
    <p
      role="status"
      className={cn(
        "mb-2 rounded-xl px-3 py-2 text-xs text-pretty",
        tone === "warning" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground",
      )}
    >
      {text}
    </p>
  )
}
