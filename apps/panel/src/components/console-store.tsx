"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useLiveServer } from "@/components/live-server"
import {
  bootLines,
  canRun,
  channel,
  chatterLine,
  CONSOLE_END_SECONDS,
  CURRENT_ROLE,
  formatClock,
  INITIAL_CONSOLE,
  REGISTERED_COMMANDS,
  shopErrorLines,
  slowTickLine,
  type ConsoleDraft,
  type ConsoleLine,
  type Role,
} from "@/lib/console-data"
import { createRandom, PLAYERS, RESOURCES, SERVER } from "@/lib/mock"

type ConsoleStore = {
  lines: ConsoleLine[]
  role: Role
  run: (input: string) => void
  clear: () => void
  announce: (text: string) => void
}

const MAX_LINES = 2000
const SLOW_TICK = 38

const STREAM_START_SECONDS = (() => {
  const last = INITIAL_CONSOLE[INITIAL_CONSOLE.length - 1]?.time ?? formatClock(CONSOLE_END_SECONDS)
  const [hours, minutes, seconds] = last.split(":").map(Number)
  return hours * 3600 + minutes * 60 + seconds + 2
})()

const FIRST_STREAM_ROUND = (() => {
  for (let index = INITIAL_CONSOLE.length - 1; index >= 0; index--) {
    const match = /Round (\d+)/.exec(INITIAL_CONSOLE[index].text)
    if (match) return Number(match[1]) + 1
  }
  return 1
})()

const ConsoleContext = createContext<ConsoleStore | null>(null)

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const live = useLiveServer()
  const [lines, setLines] = useState<ConsoleLine[]>(INITIAL_CONSOLE)
  const nextId = useRef(INITIAL_CONSOLE.length)
  const startedAt = useRef<number | null>(null)
  const pending = useRef(new Set<number>())
  const liveRef = useRef(live)

  useEffect(() => {
    liveRef.current = live
  })

  const clock = useCallback(() => {
    if (startedAt.current === null) startedAt.current = performance.now()
    return formatClock(STREAM_START_SECONDS + Math.floor((performance.now() - startedAt.current) / 1000))
  }, [])

  const append = useCallback(
    (drafts: ConsoleDraft[]) => {
      if (!drafts.length) return
      const time = clock()
      const entries = drafts.map((draft) => ({ ...draft, id: nextId.current++, time }))
      setLines((previous) => {
        const merged = previous.concat(entries)
        return merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged
      })
    },
    [clock],
  )

  const later = useCallback(
    (delay: number, drafts: ConsoleDraft[]) => {
      const timer = window.setTimeout(() => {
        pending.current.delete(timer)
        append(drafts)
      }, delay)
      pending.current.add(timer)
    },
    [append],
  )

  useEffect(() => {
    const timers = pending.current
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])

  useEffect(() => {
    const random = createRandom(7331)
    let round = FIRST_STREAM_ROUND
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.visibilityState === "visible" && liveRef.current.status === "online") {
          const draft = chatterLine(random, round)
          if (draft.text.includes("won by")) round += 1
          append([draft])
        }
        schedule()
      }, 1400 + Math.random() * 2600)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [append])

  const lastTick = live.ticks[live.ticks.length - 1]
  useEffect(() => {
    if (lastTick > SLOW_TICK) append([slowTickLine(lastTick)])
  }, [lastTick, append])

  const shopCount = live.incidents.find((incident) => incident.id === "shop-88")?.count ?? 0
  const seenShopCount = useRef(shopCount)
  useEffect(() => {
    if (shopCount <= seenShopCount.current) return
    seenShopCount.current = shopCount
    append(shopErrorLines(shopCount - 1))
  }, [shopCount, append])

  const previousStatus = useRef(live.status)
  useEffect(() => {
    const before = previousStatus.current
    previousStatus.current = live.status
    if (before === live.status) return
    const shutdown = (reason: string): ConsoleDraft[] => [
      { kind: "system", source: "argus", tag: "argus", text: `Sending shutdown notice, stopping FXServer pid ${SERVER.pid}` },
      { kind: "stdout", source: "citizen-server-impl", text: `${channel("citizen")} Server shutting down: ${reason}` },
    ]
    if (live.status === "restarting") {
      append([{ kind: "system", source: "argus", tag: "argus", text: "Restart requested by you" }, ...shutdown("restart requested")])
    } else if (live.status === "stopping") {
      append([{ kind: "system", source: "argus", tag: "argus", text: "Stop requested by you" }, ...shutdown("stopped by admin")])
    } else if (live.status === "offline") {
      append([{ kind: "system", source: "argus", tag: "argus", text: "FXServer exited with code 0. Server is offline." }])
    } else if (live.status === "starting") {
      append([{ kind: "system", source: "argus", tag: "argus", text: "Start requested by you" }])
    } else if (live.status === "online") {
      append(bootLines(SERVER.artifact, before === "starting" ? "3.2s" : "3.9s"))
    }
  }, [live.status, append])

  const run = useCallback(
    (input: string) => {
      const value = input.trim()
      if (!value) return
      const [name, ...args] = value.split(/\s+/)
      const command = REGISTERED_COMMANDS.find((entry) => entry.name === name)
      const echo: ConsoleDraft = { kind: "command", source: "console", tag: "you", text: value }

      if (!command) {
        append([echo, { kind: "stderr", source: "citizen-server-impl", tag: "stderr", text: `No such command ${name}.` }])
        return
      }
      if (!canRun(command)) {
        append([{ kind: "warn", source: "argus", tag: "argus", text: `Blocked ${name}: needs ${command.minRole}, you are ${CURRENT_ROLE}` }])
        return
      }
      if (liveRef.current.status !== "online") {
        append([echo, { kind: "warn", source: "argus", tag: "argus", text: `Server is ${liveRef.current.status}, command not sent` }])
        return
      }

      append([echo])
      const target = args[0]
      const resource = RESOURCES.find((entry) => entry.name === target)
      const missing: ConsoleDraft = {
        kind: "stderr",
        source: "citizen-server-impl",
        tag: "stderr",
        text: `Couldn't find resource ${target ?? ""}.`,
      }

      switch (command.name) {
        case "status": {
          const shown = PLAYERS.slice(0, 5)
          later(120, [
            { kind: "stdout", source: "citizen-server-impl", text: `${channel("citizen")} ${liveRef.current.players} players connected` },
            ...shown.map<ConsoleDraft>((player) => ({
              kind: "stdout",
              source: "citizen-server-impl",
              text: `${channel("citizen")} ${String(player.id).padStart(3)}  ${player.name.padEnd(10)}  ${player.ping} ms`,
            })),
          ])
          break
        }
        case "say":
          later(80, [{ kind: "stdout", source: "chat", text: `${channel("chat")} console: ${args.join(" ")}` }])
          break
        case "clientkick": {
          const player = PLAYERS.find((entry) => String(entry.id) === target)
          later(
            150,
            player
              ? [{ kind: "system", source: "argus", tag: "argus", text: `Kicked ${player.name}: ${args.slice(1).join(" ") || "no reason"}` }]
              : [{ kind: "stderr", source: "citizen-server-impl", tag: "stderr", text: `No player with id ${target ?? ""}.` }],
          )
          break
        }
        case "ensure":
        case "restart":
          if (!resource) {
            later(100, [missing])
            break
          }
          later(220, [{ kind: "stdout", source: "resources", text: `${channel("resources")} Stopping resource ${resource.name}` }])
          later(780, [{ kind: "stdout", source: "resources", text: `${channel("resources")} Started resource ${resource.name}` }])
          break
        case "start":
          later(400, resource ? [{ kind: "stdout", source: "resources", text: `${channel("resources")} Started resource ${resource.name}` }] : [missing])
          break
        case "stop":
          later(300, resource ? [{ kind: "stdout", source: "resources", text: `${channel("resources")} Stopping resource ${resource.name}` }] : [missing])
          break
        case "refresh":
          later(500, [{ kind: "stdout", source: "resources", text: `${channel("resources")} Found ${RESOURCES.length} resources.` }])
          break
        case "profiler": {
          const frames = Number(args[1]) || 300
          later(150, [{ kind: "stdout", source: "profiler", text: `${channel("profiler")} Recording ${frames} frames.` }])
          later(1800, [{ kind: "system", source: "argus", tag: "argus", text: `Profile saved  ${frames} frames  open it in Resources` }])
          break
        }
      }
    },
    [append, later],
  )

  const clear = useCallback(() => setLines([]), [])

  const announce = useCallback((text: string) => append([{ kind: "system", source: "argus", tag: "argus", text }]), [append])

  const value = useMemo<ConsoleStore>(() => ({ lines, role: CURRENT_ROLE, run, clear, announce }), [lines, run, clear, announce])

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
}

export function useConsole() {
  const context = useContext(ConsoleContext)
  if (!context) throw new Error("useConsole must be used inside ConsoleProvider")
  return context
}
