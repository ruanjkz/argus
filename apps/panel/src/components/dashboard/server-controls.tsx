"use client"

import { useState, type ReactElement } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, PlayIcon, RefreshIcon, StopIcon } from "@hugeicons/core-free-icons"

import { useLiveServer } from "@/components/live-server"
import { IconSwap } from "@/components/motion-primitives"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SERVER } from "@/lib/mock"
import { cn } from "@/lib/utils"

type Confirm = "stop" | "restart" | null

const CONTROL =
  "press inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

function Spinner({ spinning }: { spinning: boolean }) {
  return <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.75} className={cn("size-3.5", spinning && "animate-spin motion-reduce:animate-none")} />
}

export function ServerControls() {
  const { status, players, start, stop, restart } = useLiveServer()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const offline = status === "offline"
  const online = status === "online"

  function handleConfirm() {
    if (confirm === "stop") stop()
    if (confirm === "restart") restart()
    setConfirm(null)
  }

  return (
    <>
      <div className="flex items-center gap-1 rounded-xl border border-border/70 p-0.5" role="group" aria-label="Server controls">
        <ControlTooltip label="Start server">
          <button
            type="button"
            onClick={start}
            disabled={!offline}
            aria-label="Start server"
            className={cn(CONTROL, offline ? "bg-primary text-primary-foreground hover:bg-primary/85" : "text-muted-foreground")}
          >
            <IconSwap
              active={status === "starting" ? "b" : "a"}
              first={<HugeiconsIcon icon={PlayIcon} strokeWidth={1.75} className="size-3.5" />}
              second={<Spinner spinning={status === "starting"} />}
            />
            <span className="hidden sm:inline">Start</span>
          </button>
        </ControlTooltip>
        <ControlTooltip label="Restart server">
          <button
            type="button"
            onClick={() => setConfirm("restart")}
            disabled={!online}
            aria-label="Restart server"
            className={cn(CONTROL, "text-foreground/90 hover:bg-muted")}
          >
            <IconSwap
              active={status === "restarting" ? "b" : "a"}
              first={<HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} className="size-3.5" />}
              second={<Spinner spinning={status === "restarting"} />}
            />
            <span className="hidden sm:inline">Restart</span>
          </button>
        </ControlTooltip>
        <ControlTooltip label="Stop server">
          <button
            type="button"
            onClick={() => setConfirm("stop")}
            disabled={!online}
            aria-label="Stop server"
            className={cn(CONTROL, "text-destructive hover:bg-destructive/10")}
          >
            <IconSwap
              active={status === "stopping" ? "b" : "a"}
              first={<HugeiconsIcon icon={StopIcon} strokeWidth={1.75} className="size-3.5" />}
              second={<Spinner spinning={status === "stopping"} />}
            />
            <span className="hidden sm:inline">Stop</span>
          </button>
        </ControlTooltip>
      </div>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent showCloseButton={false} className="rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold wrap-anywhere">
              {confirm === "stop" ? `Stop ${SERVER.name}?` : `Restart ${SERVER.name}?`}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {confirm === "stop"
                ? `${players} players will be disconnected. The server stays offline until you start it again.`
                : `${players} players get a shutdown notice, then the server restarts. This usually takes under a minute.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" autoFocus={confirm === "stop"} className="h-8 rounded-lg px-3">
                Cancel
              </Button>
            </DialogClose>
            <Button
              autoFocus={confirm !== "stop"}
              onClick={handleConfirm}
              className={cn(
                "h-8 rounded-lg px-3",
                confirm === "stop" && "bg-destructive text-white hover:bg-destructive/85 dark:text-white",
              )}
            >
              {confirm === "stop" ? "Stop server" : "Restart"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ControlTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
