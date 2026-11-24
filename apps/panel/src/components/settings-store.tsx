"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { useAgent } from "@/components/agent-store"
import { changedKeys, DEFAULT_SETTINGS, fromDraft, toDraft, type SettingKey, type Settings, type SettingsDraft } from "@/lib/settings"

type SettingsStore = {
  settings: Settings
  draft: SettingsDraft
  changed: SettingKey[]
  update: (patch: Partial<SettingsDraft>) => void
  discard: () => void
  save: () => Promise<Settings>
  reload: () => void
}

const SettingsContext = createContext<SettingsStore | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { mode, call } = useAgent()
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(DEFAULT_SETTINGS))

  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (mode !== "live") return
    let cancelled = false
    call<Partial<Settings>>("GET", "settings")
      .then((loaded) => {
        if (cancelled) return
        const next = { ...DEFAULT_SETTINGS, ...loaded }
        setSettings(next)
        setDraft(toDraft(next))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [mode, call, revision])

  const reload = useCallback(() => setRevision((value) => value + 1), [])

  const update = useCallback((patch: Partial<SettingsDraft>) => setDraft((previous) => ({ ...previous, ...patch })), [])

  const discard = useCallback(() => setDraft(toDraft(settings)), [settings])

  const save = useCallback(async () => {
    const next = fromDraft(draft)
    const stored = mode === "live" ? { ...DEFAULT_SETTINGS, ...(await call<Partial<Settings>>("PUT", "settings", next)) } : next
    setSettings(stored)
    setDraft(toDraft(stored))
    return stored
  }, [draft, mode, call])

  const changed = useMemo(() => changedKeys(draft, toDraft(settings)), [draft, settings])

  const value = useMemo<SettingsStore>(
    () => ({ settings, draft, changed, update, discard, save, reload }),
    [settings, draft, changed, update, discard, save, reload],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error("useSettings must be used inside SettingsProvider")
  return context
}

export function ServerName() {
  return <>{useSettings().settings.name}</>
}
