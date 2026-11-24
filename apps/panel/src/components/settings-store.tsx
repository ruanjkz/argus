"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

import { changedKeys, DEFAULT_SETTINGS, fromDraft, toDraft, type SettingKey, type Settings, type SettingsDraft } from "@/lib/settings"

type SettingsStore = {
  settings: Settings
  draft: SettingsDraft
  changed: SettingKey[]
  update: (patch: Partial<SettingsDraft>) => void
  discard: () => void
  save: () => Settings
}

const SettingsContext = createContext<SettingsStore | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(DEFAULT_SETTINGS))

  const update = useCallback((patch: Partial<SettingsDraft>) => setDraft((previous) => ({ ...previous, ...patch })), [])

  const discard = useCallback(() => setDraft(toDraft(settings)), [settings])

  const save = useCallback(() => {
    const next = fromDraft(draft)
    setSettings(next)
    setDraft(toDraft(next))
    return next
  }, [draft])

  const changed = useMemo(() => changedKeys(draft, toDraft(settings)), [draft, settings])

  const value = useMemo<SettingsStore>(
    () => ({ settings, draft, changed, update, discard, save }),
    [settings, draft, changed, update, discard, save],
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
