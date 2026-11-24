export type ResourceRuntime = "lua" | "javascript"

export type ResourceInitialState = "started" | "stopped" | "failed"

export type ResourceInfo = {
  name: string
  folder: string
  description: string
  version: string
  runtime: ResourceRuntime
  dependencies: string[]
  serverScripts: number
  clientScripts: number
  cpuMs: number
  memoryKb: number
  initial: ResourceInitialState
  failure?: string
  required?: boolean
}

type Entry = Omit<ResourceInfo, "initial" | "dependencies"> & { initial?: ResourceInitialState; dependencies?: string[] }

const ENTRIES: Entry[] = [
  { name: "argus", folder: "[system]", description: "Heartbeat and player events for the Argus agent", version: "0.1.0", runtime: "lua", serverScripts: 1, clientScripts: 0, cpuMs: 0.02, memoryKb: 96, required: true },
  { name: "oxmysql", folder: "[system]", description: "MySQL connection pool", version: "2.11.2", runtime: "javascript", serverScripts: 1, clientScripts: 0, cpuMs: 0.21, memoryKb: 21400 },
  { name: "ox_lib", folder: "[system]", description: "Shared Lua helpers and UI primitives", version: "3.26.0", runtime: "lua", serverScripts: 9, clientScripts: 31, cpuMs: 0.08, memoryKb: 2310 },
  { name: "pma-voice", folder: "[system]", description: "Proximity and radio voice", version: "6.6.2", runtime: "lua", serverScripts: 6, clientScripts: 11, cpuMs: 0.34, memoryKb: 1480 },
  { name: "screenshot-basic", folder: "[system]", description: "Screenshots for ban evidence", version: "1.0.0", runtime: "javascript", serverScripts: 1, clientScripts: 1, cpuMs: 0.01, memoryKb: 5120 },
  { name: "arena", folder: "[arena]", description: "Round flow, spawns and scoring", version: "4.2.1", runtime: "lua", dependencies: ["ox_lib", "oxmysql"], serverScripts: 14, clientScripts: 18, cpuMs: 0.62, memoryKb: 18400 },
  { name: "arena_ui", folder: "[arena]", description: "Scoreboard and round HUD", version: "4.2.0", runtime: "javascript", dependencies: ["arena"], serverScripts: 0, clientScripts: 3, cpuMs: 0.05, memoryKb: 760 },
  { name: "matchmaking", folder: "[arena]", description: "Queue and team balancing", version: "2.0.4", runtime: "lua", dependencies: ["arena", "oxmysql"], serverScripts: 5, clientScripts: 2, cpuMs: 0.18, memoryKb: 3200 },
  { name: "ranked", folder: "[arena]", description: "MMR and seasons", version: "1.8.0", runtime: "lua", dependencies: ["matchmaking", "oxmysql"], serverScripts: 4, clientScripts: 1, cpuMs: 0.09, memoryKb: 2850 },
  { name: "lobby", folder: "[arena]", description: "Lobby world between rounds", version: "1.3.2", runtime: "lua", dependencies: ["arena"], serverScripts: 3, clientScripts: 6, cpuMs: 0.07, memoryKb: 1900 },
  { name: "spectate", folder: "[arena]", description: "Spectator camera", version: "1.1.0", runtime: "lua", dependencies: ["arena"], serverScripts: 2, clientScripts: 4, cpuMs: 0.11, memoryKb: 940 },
  { name: "loadouts", folder: "[arena]", description: "Weapon presets per mode", version: "2.2.0", runtime: "lua", dependencies: ["inventory"], serverScripts: 3, clientScripts: 3, cpuMs: 0.06, memoryKb: 1210 },
  { name: "inventory", folder: "[gameplay]", description: "Items, slots and weapon ammo", version: "5.4.0", runtime: "lua", dependencies: ["ox_lib", "oxmysql"], serverScripts: 11, clientScripts: 9, cpuMs: 1.84, memoryKb: 9200 },
  { name: "shop", folder: "[gameplay]", description: "Buy items between rounds", version: "1.6.3", runtime: "lua", dependencies: ["inventory"], serverScripts: 2, clientScripts: 2, cpuMs: 0.12, memoryKb: 1040 },
  { name: "garage", folder: "[gameplay]", description: "Vehicle spawns for large maps", version: "1.2.0", runtime: "lua", dependencies: ["oxmysql"], serverScripts: 3, clientScripts: 4, cpuMs: 0.09, memoryKb: 1620 },
  { name: "bank", folder: "[gameplay]", description: "Season currency and payouts", version: "0.9.1", runtime: "lua", dependencies: ["oxmysql", "economy"], serverScripts: 4, clientScripts: 1, cpuMs: 0.1, memoryKb: 1300, initial: "failed", failure: "Could not find dependency economy for resource bank" },
  { name: "killfeed", folder: "[gameplay]", description: "Kill notifications", version: "1.0.5", runtime: "lua", dependencies: ["arena"], serverScripts: 1, clientScripts: 2, cpuMs: 0.04, memoryKb: 420 },
  { name: "hud", folder: "[gameplay]", description: "Health, armor and ammo HUD", version: "3.1.0", runtime: "javascript", dependencies: ["ox_lib"], serverScripts: 0, clientScripts: 2, cpuMs: 0.03, memoryKb: 680 },
  { name: "chat", folder: "[gameplay]", description: "Chat with staff channels", version: "2.0.0", runtime: "lua", serverScripts: 2, clientScripts: 2, cpuMs: 0.02, memoryKb: 510 },
  { name: "discord_roles", folder: "[integrations]", description: "Maps Discord roles to permissions", version: "1.4.0", runtime: "javascript", serverScripts: 1, clientScripts: 0, cpuMs: 0.03, memoryKb: 7300 },
  { name: "anticheat_stats", folder: "[integrations]", description: "Per-round accuracy and damage stats", version: "0.7.2", runtime: "javascript", dependencies: ["oxmysql"], serverScripts: 1, clientScripts: 0, cpuMs: 0.27, memoryKb: 11800 },
  { name: "maps_vinewood", folder: "[assets]", description: "Vinewood arena map", version: "1.0.0", runtime: "lua", serverScripts: 0, clientScripts: 0, cpuMs: 0, memoryKb: 0 },
  { name: "maps_sandy", folder: "[assets]", description: "Sandy Shores arena map", version: "1.0.0", runtime: "lua", serverScripts: 0, clientScripts: 0, cpuMs: 0, memoryKb: 0, initial: "stopped" },
  { name: "weapons_meta", folder: "[assets]", description: "Weapon balance metadata", version: "2.3.0", runtime: "lua", serverScripts: 0, clientScripts: 1, cpuMs: 0, memoryKb: 30 },
  { name: "vehicles_meta", folder: "[assets]", description: "Vehicle handling metadata", version: "1.1.0", runtime: "lua", serverScripts: 0, clientScripts: 1, cpuMs: 0, memoryKb: 30 },
]

export const RESOURCE_CATALOG: ResourceInfo[] = ENTRIES.map((entry) => ({
  ...entry,
  initial: entry.initial ?? "started",
  dependencies: entry.dependencies ?? [],
}))

export const TICK_BUDGET_MS = 50

export function formatMemory(kilobytes: number) {
  if (kilobytes <= 0) return "0 KB"
  if (kilobytes < 1024) return `${kilobytes} KB`
  return `${(kilobytes / 1024).toFixed(1)} MB`
}

export function formatCpu(milliseconds: number) {
  return `${milliseconds.toFixed(2)} ms`
}
