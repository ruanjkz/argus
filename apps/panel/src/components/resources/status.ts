import type { ResourceStatus, ResourceView } from "@/components/resources-store"

export const RESOURCE_STATUS: Record<ResourceStatus, { label: string; dot: string; text: string }> = {
  started: { label: "Started", dot: "bg-success", text: "text-foreground/80" },
  starting: { label: "Starting", dot: "bg-warning", text: "text-warning" },
  stopping: { label: "Stopping", dot: "bg-warning", text: "text-warning" },
  stopped: { label: "Stopped", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  failed: { label: "Failed", dot: "bg-destructive", text: "text-destructive" },
}

export type FolderStats = { total: number; started: number; cpuMs: number; memoryKb: number }

export function folderStatsOf(resources: ResourceView[]) {
  const stats = new Map<string, FolderStats>()
  for (const resource of resources) {
    const entry = stats.get(resource.folder) ?? { total: 0, started: 0, cpuMs: 0, memoryKb: 0 }
    entry.total += 1
    if (resource.status === "started") {
      entry.started += 1
      entry.cpuMs += resource.liveCpuMs
      entry.memoryKb += resource.memoryKb
    }
    stats.set(resource.folder, entry)
  }
  return stats
}

export function hasProblems(resource: ResourceView) {
  return resource.status === "failed" || resource.errors > 0 || resource.warnings > 0
}

export function isBusy(resource: ResourceView) {
  return resource.status === "starting" || resource.status === "stopping"
}
