"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { LanguageSkillIcon } from "@hugeicons/core-free-icons"

import { LOCALES, t, useI18n, type Locale } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function LanguageSelect({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n()
  return (
    <label
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground focus-within:ring-2 focus-within:ring-ring hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <HugeiconsIcon icon={LanguageSkillIcon} strokeWidth={1.75} className="size-3.5 shrink-0" />
      <span className="sr-only">{t("Language")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="cursor-pointer appearance-none bg-transparent pr-1 text-xs text-inherit outline-none"
      >
        {LOCALES.map((option) => (
          <option key={option.value} value={option.value} className="bg-background text-foreground">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
