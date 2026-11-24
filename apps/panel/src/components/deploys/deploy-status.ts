import type { DeployStatus } from "@/lib/deploys"

export const DEPLOY_STATUS: Record<DeployStatus, { label: string; dot: string; text: string }> = {
  building: { label: "Building", dot: "bg-warning", text: "text-warning" },
  staged: { label: "Staged", dot: "bg-info", text: "text-info" },
  live: { label: "Live", dot: "bg-success", text: "text-success" },
  failed: { label: "Failed", dot: "bg-destructive", text: "text-destructive" },
  superseded: { label: "Previous", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  cancelled: { label: "Cancelled", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
}
