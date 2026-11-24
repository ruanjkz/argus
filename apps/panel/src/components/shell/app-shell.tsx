"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Menu01Icon } from "@hugeicons/core-free-icons"

import { ArgusMark } from "@/components/argus-mark"
import { ConsoleProvider } from "@/components/console-store"
import { PlayersProvider } from "@/components/players-store"
import { LiveServerProvider } from "@/components/live-server"
import { ResourcesProvider } from "@/components/resources-store"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { SERVER } from "@/lib/mock"
import { cn } from "@/lib/utils"

import { AppSidebar, SidebarRail } from "./app-sidebar"

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [instant, setInstant] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggle = useCallback(() => {
    setInstant(false)
    setCollapsed((value) => !value)
  }, [])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault()
        if (event.repeat) return
        setInstant(true)
        setCollapsed((value) => !value)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  return (
    <ServerProviders>
      <div className="relative flex h-dvh bg-panel">
        <div
          data-instant={instant ? "" : undefined}
          className={cn("t-resize hidden h-full shrink-0 overflow-hidden md:block", collapsed ? "w-12" : "w-72")}
        >
          {collapsed ? (
            <SidebarRail onToggle={toggle} />
          ) : (
            <div className="h-full w-72">
              <AppSidebar onToggle={toggle} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-2">
          <div className="mb-2 flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open navigation"
                  className="press grid size-9 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <HugeiconsIcon icon={Menu01Icon} strokeWidth={1.75} className="size-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" showCloseButton={false} className="w-80 bg-panel p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <AppSidebar onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <ArgusMark id="mobile-bar" />
              <span className="truncate">{SERVER.name}</span>
            </span>
          </div>
          <main className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-background">{children}</main>
        </div>
      </div>
    </ServerProviders>
  )
}

function ServerProviders({ children }: { children: ReactNode }) {
  return (
    <LiveServerProvider>
      <ResourcesProvider>
        <ConsoleProvider>
          <PlayersProvider>{children}</PlayersProvider>
        </ConsoleProvider>
      </ResourcesProvider>
    </LiveServerProvider>
  )
}
