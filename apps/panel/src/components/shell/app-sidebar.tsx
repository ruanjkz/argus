"use client"

import { useId, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  ComputerTerminal01Icon,
  DashboardSquare01Icon,
  GitBranchIcon,
  PackageIcon,
  Settings01Icon,
  SidebarLeft01Icon,
  Tick02Icon,
  UnfoldMoreIcon,
  UserBlock01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

import { ArgusMark } from "@/components/argus-mark"
import { useLiveServer } from "@/components/live-server"
import { AnimatedNumber } from "@/components/motion-primitives"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ServerName } from "@/components/settings-store"
import { SERVER } from "@/lib/mock"
import { cn } from "@/lib/utils"

import { ThemeToggle } from "./theme-toggle"

const ROW =
  "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground active:bg-muted active:text-foreground focus-visible:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-45 aria-expanded:bg-muted aria-expanded:text-foreground"

const ICON_BUTTON =
  "press grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

type NavEntry = { href: string; label: string; icon: IconSvgElement }

const NAV_ENTRIES: NavEntry[] = [
  { href: "/", label: "Dashboard", icon: DashboardSquare01Icon },
  { href: "/console", label: "Console", icon: ComputerTerminal01Icon },
  { href: "/players", label: "Players", icon: UserGroupIcon },
  { href: "/bans", label: "Bans", icon: UserBlock01Icon },
  { href: "/resources", label: "Resources", icon: PackageIcon },
  { href: "/deploys", label: "Deploys", icon: GitBranchIcon },
  { href: "/settings", label: "Settings", icon: Settings01Icon },
]

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

export function AppSidebar({ onToggle, onNavigate }: { onToggle?: () => void; onNavigate?: () => void }) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-1.5 p-2 md:pr-0" aria-label="Server">
      <div className="flex items-center gap-1 pr-1">
        <ServerSwitcher />
        {onToggle ? <SidebarToggle onToggle={onToggle} /> : null}
      </div>
      <Navigation onNavigate={onNavigate} />
      <div className="mt-auto flex items-center justify-between px-1 pb-0.5">
        <ThemeToggle />
        <span className="font-mono text-[11px] text-muted-foreground/60">v0.1</span>
      </div>
    </aside>
  )
}

function ServerSwitcher() {
  const markId = `switcher-${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-2 text-left outline-none transition-colors hover:bg-muted active:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background">
            <ArgusMark id={markId} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-5 font-medium text-foreground/90"><ServerName /></span>
            <span className="block truncate font-mono text-[11px] leading-4 text-muted-foreground/80">{SERVER.license}</span>
          </span>
          <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={1.75} className="size-3.5 shrink-0 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60 rounded-xl" align="start">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Servers</DropdownMenuLabel>
        <DropdownMenuItem>
          <span className="size-1.5 rounded-full bg-success" />
          <ServerName />
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.75} className="ml-auto size-3.5" />
        </DropdownMenuItem>
        <DropdownMenuItem>
          <span className="size-1.5 rounded-full bg-muted-foreground/50" />
          arena-staging
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          Add server
          <DropdownMenuShortcut>Ctrl N</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarToggle({ onToggle }: { onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onToggle} aria-label="Collapse sidebar" aria-keyshortcuts="Control+B" className={ICON_BUTTON}>
          <HugeiconsIcon icon={SidebarLeft01Icon} strokeWidth={1.75} className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        Collapse sidebar
        <Kbd>Ctrl B</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { players } = useLiveServer()
  return (
    <nav aria-label="Main" className="mt-1">
      <ul className="flex flex-col gap-0.5">
        {NAV_ENTRIES.map((entry) => {
          const active = isActivePath(pathname, entry.href)
          return (
            <li key={entry.href}>
              <Link href={entry.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(ROW, active && "bg-muted text-foreground")}>
                <HugeiconsIcon icon={entry.icon} strokeWidth={1.75} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{entry.label}</span>
                {entry.href === "/players" ? (
                  <span className="font-mono text-[11px] text-muted-foreground/70">
                    <AnimatedNumber value={players} />
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function SidebarRail({ onToggle }: { onToggle: () => void }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="flex h-full w-12 shrink-0 flex-col items-center gap-1 py-2">
      <span className="mb-1 grid size-8 place-items-center rounded-lg bg-background">
        <ArgusMark id="rail" />
      </span>
      <RailButton label="Expand sidebar" shortcut="Ctrl B" keyshortcuts="Control+B" onClick={onToggle}>
        <HugeiconsIcon icon={SidebarLeft01Icon} strokeWidth={1.75} className="size-4" />
      </RailButton>
      <div className="my-1 h-px w-6 bg-border" />
      {NAV_ENTRIES.map((entry) => {
        const active = isActivePath(pathname, entry.href)
        return (
          <Tooltip key={entry.href}>
            <TooltipTrigger asChild>
              <Link
                href={entry.href}
                aria-label={entry.label}
                aria-current={active ? "page" : undefined}
                className={cn(ICON_BUTTON, active && "bg-muted text-foreground")}
              >
                <HugeiconsIcon icon={entry.icon} strokeWidth={1.75} className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{entry.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}

function RailButton({
  label,
  shortcut,
  keyshortcuts,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  keyshortcuts?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} aria-label={label} aria-keyshortcuts={keyshortcuts} className={ICON_BUTTON}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  )
}
