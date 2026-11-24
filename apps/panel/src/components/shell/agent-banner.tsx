"use client"

import { useAgent } from "@/components/agent-store"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function AgentBanner() {
  const { mode, reachable } = useAgent()

  let text: string | null = null
  let tone: "muted" | "warning" = "muted"
  if (mode === "demo") {
    text = "Demo mode. The Argus agent is not running, so everything here is sample data. Run argus start to manage your server."
  } else if (mode === "live" && !reachable) {
    text = "Lost the connection to the Argus agent. Reconnecting…"
    tone = "warning"
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
      {t(text)}
    </p>
  )
}
