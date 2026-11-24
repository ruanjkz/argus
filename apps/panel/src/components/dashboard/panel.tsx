import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

export function Panel({
  title,
  meta,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section aria-label={t(title)} className={cn("flex min-w-0 flex-col rounded-2xl border border-border/70", className)}>
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{t(title)}</h2>
          {meta ? (
            <p className="mt-0.5 overflow-hidden font-mono text-[11px] text-ellipsis whitespace-pre text-muted-foreground">{typeof meta === "string" ? t(meta) : meta}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      <div className={cn("min-w-0 flex-1 px-4 pb-4", bodyClassName)}>{children}</div>
    </section>
  )
}
