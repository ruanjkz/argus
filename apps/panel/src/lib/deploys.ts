export type DeployStatus = "building" | "staged" | "live" | "failed" | "superseded" | "cancelled"

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped"

export type StepId = "fetch" | "diff" | "install" | "boot" | "stage"

export type DeployStep = { id: StepId; status: StepStatus; detail?: string }

export type FileChange = { path: string; added: number; removed: number }

export type ResourceChange = { resource: string; folder: string; kind: "changed" | "added" | "removed"; files: FileChange[] }

export type Deploy = {
  id: string
  commit: string
  message: string
  author: string
  branch: string
  createdSecondsAgo: number
  appliedSecondsAgo?: number
  status: DeployStatus
  steps: DeployStep[]
  changes: ResourceChange[]
  failure?: string
  rollbackOf?: string
}

export const REPOSITORY = { remote: "origin", url: "git@github.com:example/arena-server.git", branch: "main", stagingPort: 30121 }

export const STEP_LABEL: Record<StepId, string> = {
  fetch: "Fetch from origin",
  diff: "Compare resources",
  install: "Install dependencies",
  boot: "Test boot on a second instance",
  stage: "Stage for the next restart",
}

export const STEP_ORDER: StepId[] = ["fetch", "diff", "install", "boot", "stage"]

export const STEP_MS: Record<StepId, number> = { fetch: 700, diff: 500, install: 1100, boot: 1900, stage: 400 }

function doneSteps(details: Partial<Record<StepId, string>> = {}): DeployStep[] {
  return STEP_ORDER.map((id) => ({ id, status: "done", detail: details[id] }))
}

export const INITIAL_DEPLOYS: Deploy[] = [
  {
    id: "d-7",
    commit: "9c4e1a2",
    message: "Raise shop prices for armor and fix the missing price on medkits",
    author: "lia.mod",
    branch: "main",
    createdSecondsAgo: 1500,
    status: "staged",
    steps: doneSteps({ fetch: "3 commits", diff: "2 resources", install: "no changes", boot: "booted in 4.1s", stage: "waiting" }),
    changes: [
      {
        resource: "shop",
        folder: "[gameplay]",
        kind: "changed",
        files: [
          { path: "config.lua", added: 14, removed: 9 },
          { path: "server.lua", added: 6, removed: 2 },
        ],
      },
      { resource: "inventory", folder: "[gameplay]", kind: "changed", files: [{ path: "data/items.lua", added: 3, removed: 0 }] },
    ],
  },
  {
    id: "d-6",
    commit: "e18b07f",
    message: "Add spectate camera smoothing",
    author: "admin",
    branch: "main",
    createdSecondsAgo: 36200,
    appliedSecondsAgo: 34920,
    status: "live",
    steps: doneSteps({ fetch: "1 commit", diff: "1 resource", install: "no changes", boot: "booted in 3.8s", stage: "applied at 04:00" }),
    changes: [{ resource: "spectate", folder: "[arena]", kind: "changed", files: [{ path: "client/camera.lua", added: 41, removed: 17 }] }],
  },
  {
    id: "d-5",
    commit: "51ad9c3",
    message: "Vehicle spawns for Paleto",
    author: "admin",
    branch: "main",
    createdSecondsAgo: 52000,
    status: "failed",
    steps: [
      { id: "fetch", status: "done", detail: "2 commits" },
      { id: "diff", status: "done", detail: "1 resource" },
      { id: "install", status: "done", detail: "no changes" },
      { id: "boot", status: "failed", detail: "script error" },
      { id: "stage", status: "skipped" },
    ],
    failure: "SCRIPT ERROR: @garage/server.lua:41: attempt to call a nil value (global 'GetSpawnForMap')",
    changes: [
      {
        resource: "garage",
        folder: "[gameplay]",
        kind: "changed",
        files: [
          { path: "server.lua", added: 22, removed: 4 },
          { path: "spawns/paleto.lua", added: 58, removed: 0 },
        ],
      },
    ],
  },
  {
    id: "d-4",
    commit: "a07c2de",
    message: "Season 4 ranked rewards",
    author: "admin",
    branch: "main",
    createdSecondsAgo: 210000,
    appliedSecondsAgo: 207400,
    status: "superseded",
    steps: doneSteps({ fetch: "4 commits", diff: "2 resources", install: "oxmysql 2.11.2", boot: "booted in 4.4s", stage: "applied at 04:00" }),
    changes: [
      { resource: "ranked", folder: "[arena]", kind: "changed", files: [{ path: "server/rewards.lua", added: 77, removed: 31 }] },
      { resource: "oxmysql", folder: "[system]", kind: "changed", files: [{ path: "fxmanifest.lua", added: 1, removed: 1 }] },
    ],
  },
  {
    id: "d-3",
    commit: "3fb6e90",
    message: "Add anticheat_stats",
    author: "lia.mod",
    branch: "main",
    createdSecondsAgo: 380000,
    appliedSecondsAgo: 380000 - 2400,
    status: "superseded",
    steps: doneSteps({ fetch: "1 commit", diff: "1 resource", install: "2 packages", boot: "booted in 4.0s", stage: "applied now" }),
    changes: [
      {
        resource: "anticheat_stats",
        folder: "[integrations]",
        kind: "added",
        files: [
          { path: "fxmanifest.lua", added: 9, removed: 0 },
          { path: "server.js", added: 214, removed: 0 },
          { path: "package.json", added: 12, removed: 0 },
        ],
      },
    ],
  },
]

export const INCOMING_COMMITS: Omit<Deploy, "id" | "createdSecondsAgo" | "status" | "steps">[] = [
  {
    commit: "c2f93b1",
    message: "Killfeed shows headshots",
    author: "admin",
    branch: "main",
    changes: [{ resource: "killfeed", folder: "[gameplay]", kind: "changed", files: [{ path: "client.lua", added: 12, removed: 3 }] }],
  },
  {
    commit: "7d0e4aa",
    message: "Lobby music volume and new spawn points",
    author: "lia.mod",
    branch: "main",
    changes: [
      {
        resource: "lobby",
        folder: "[arena]",
        kind: "changed",
        files: [
          { path: "client/music.lua", added: 4, removed: 4 },
          { path: "config.lua", added: 18, removed: 2 },
        ],
      },
    ],
  },
]

export function lineTotals(changes: ResourceChange[]) {
  let added = 0
  let removed = 0
  for (const change of changes) {
    for (const file of change.files) {
      added += file.added
      removed += file.removed
    }
  }
  return { added, removed, files: changes.reduce((total, change) => total + change.files.length, 0) }
}

export type DriftState = "modified" | "added" | "deleted" | "untracked"

export type DriftEntry = { path: string; resource: string; state: DriftState; editedSecondsAgo: number }

export const INITIAL_DRIFT: DriftEntry[] = [
  { path: "[gameplay]/inventory/server/tick.lua", resource: "inventory", state: "modified", editedSecondsAgo: 1500 },
  { path: "[gameplay]/shop/config.lua", resource: "shop", state: "modified", editedSecondsAgo: 5400 },
  { path: "[gameplay]/shop/backup_config.lua", resource: "shop", state: "untracked", editedSecondsAgo: 5400 },
]

export function changedPaths(changes: ResourceChange[]) {
  return new Set(changes.flatMap((change) => change.files.map((file) => `${change.folder}/${change.resource}/${file.path}`)))
}

export type BranchInfo = { name: string; commit: string; message: string; author: string; ageSeconds: number; changes: ResourceChange[] }

export const BRANCHES: BranchInfo[] = [
  { name: "main", commit: "e18b07f", message: "Add spectate camera smoothing", author: "admin", ageSeconds: 36200, changes: [] },
  {
    name: "staging",
    commit: "4be07d1",
    message: "Try the new matchmaking queue",
    author: "lia.mod",
    ageSeconds: 7200,
    changes: [
      {
        resource: "matchmaking",
        folder: "[arena]",
        kind: "changed",
        files: [
          { path: "server/queue.lua", added: 96, removed: 54 },
          { path: "config.lua", added: 5, removed: 1 },
        ],
      },
    ],
  },
  {
    name: "season-5",
    commit: "d93a6f2",
    message: "Season 5 maps and loadouts",
    author: "admin",
    ageSeconds: 190000,
    changes: [
      { resource: "loadouts", folder: "[arena]", kind: "changed", files: [{ path: "presets.lua", added: 48, removed: 12 }] },
      { resource: "maps_docks", folder: "[assets]", kind: "added", files: [{ path: "fxmanifest.lua", added: 8, removed: 0 }] },
    ],
  },
  {
    name: "hotfix/shop-prices",
    commit: "9c4e1a2",
    message: "Raise shop prices for armor and fix the missing price on medkits",
    author: "lia.mod",
    ageSeconds: 1500,
    changes: [{ resource: "shop", folder: "[gameplay]", kind: "changed", files: [{ path: "config.lua", added: 14, removed: 9 }] }],
  },
  {
    name: "feature/garage-paleto",
    commit: "51ad9c3",
    message: "Vehicle spawns for Paleto",
    author: "admin",
    ageSeconds: 52000,
    changes: [{ resource: "garage", folder: "[gameplay]", kind: "changed", files: [{ path: "server.lua", added: 22, removed: 4 }] }],
  },
  {
    name: "feature/killfeed-headshots",
    commit: "c2f93b1",
    message: "Killfeed shows headshots",
    author: "admin",
    ageSeconds: 90000,
    changes: [{ resource: "killfeed", folder: "[gameplay]", kind: "changed", files: [{ path: "client.lua", added: 12, removed: 3 }] }],
  },
  {
    name: "experiment/ranked-decay",
    commit: "6aa10f4",
    message: "MMR decay after two idle weeks",
    author: "lia.mod",
    ageSeconds: 610000,
    changes: [{ resource: "ranked", folder: "[arena]", kind: "changed", files: [{ path: "server/decay.lua", added: 64, removed: 0 }] }],
  },
]
