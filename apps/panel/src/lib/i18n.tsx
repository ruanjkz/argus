"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react"

import { MESSAGES } from "./messages"

export type Locale = "en" | "es" | "pt-BR"

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt-BR", label: "Português (Brasil)" },
]

const STORAGE_KEY = "argus-locale"
const CHANGE_EVENT = "argus-locale-change"

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

type Template = { pattern: RegExp; names: string[]; target: string }

let activeLocale: Locale = "en"

function activate(locale: Locale) {
  activeLocale = locale
}

export function t(text: string, values?: Record<string, string | number>) {
  return translate(activeLocale, text, values)
}

const compiled = new Map<Locale, Template[]>()
const cache = new Map<string, string>()

const escape = (value: string) => value.replace(/[.*+?^$()|[\]\\]/g, "\\$&")

function templatesFor(locale: Locale) {
  const existing = compiled.get(locale)
  if (existing) return existing
  const dictionary = locale === "en" ? {} : MESSAGES[locale]
  const templates: Template[] = []
  for (const [source, target] of Object.entries(dictionary)) {
    if (!source.includes("{")) continue
    const names: string[] = []
    const pattern = source
      .split(/(\{\w+\})/)
      .map((part) => {
        const match = /^\{(\w+)\}$/.exec(part)
        if (!match) return escape(part)
        names.push(match[1])
        return "(.+?)"
      })
      .join("")
    templates.push({ pattern: new RegExp(`^${pattern}$`, "s"), names, target })
  }
  compiled.set(locale, templates)
  return templates
}

function fill(text: string, values: Record<string, string | number> | undefined) {
  if (!values) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match))
}

export function translate(locale: Locale, text: string, values?: Record<string, string | number>): string {
  if (locale === "en" || !text) return fill(text, values)
  const dictionary = MESSAGES[locale]
  const direct = dictionary[text]
  if (direct !== undefined) return fill(direct, values)
  if (values) return fill(text, values)
  const key = `${locale}\u0000${text}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  let result = text
  for (const template of templatesFor(locale)) {
    const match = template.pattern.exec(text)
    if (!match) continue
    const captured = Object.fromEntries(template.names.map((name, index) => [name, translate(locale, match[index + 1])]))
    result = fill(template.target, captured)
    break
  }
  cache.set(key, result)
  return result
}

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en"
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "en" || stored === "es" || stored === "pt-BR") return stored
  } catch {
    return "en"
  }
  const language = window.navigator.language.toLowerCase()
  if (language.startsWith("pt")) return "pt-BR"
  if (language.startsWith("es")) return "es"
  return "en"
}

type I18n = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (text: string, values?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18n>({ locale: "en", setLocale: () => undefined, t: (text, values) => fill(text, values) })

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, detectLocale, () => "en" as Locale)
  activate(locale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      return
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  const translateWith = useCallback((text: string, values?: Record<string, string | number>) => translate(locale, text, values), [locale])

  const value = useMemo(() => ({ locale, setLocale, t: translateWith }), [locale, setLocale, translateWith])
  return (
    <I18nContext.Provider value={value}>
      <LocaleBoundary key={locale}>{children}</LocaleBoundary>
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}

export function useT() {
  return useContext(I18nContext).t
}

function LocaleBoundary({ children }: { children: ReactNode }) {
  return <>{children}</>
}
