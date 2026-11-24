"use client"

import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"

import { agentCall, useAgent } from "@/components/agent-store"
import { CopyButton } from "@/components/detail-parts"
import { cn } from "@/lib/utils"

type Remote = { enabled: boolean; port: number; addresses: string[] }

export function RemoteSettings() {
  const { account, mode } = useAgent()
  const [remote, setRemote] = useState<Remote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const live = mode === "live"
  const owner = account?.role === "owner"

  useEffect(() => {
    if (!live || account?.role === "moderator") return
    agentCall<Remote>("GET", "remote")
      .then(setRemote)
      .catch(() => undefined)
  }, [live, account?.role])

  async function toggle() {
    if (!remote) return
    setBusy(true)
    setError(null)
    try {
      setRemote(await agentCall<Remote>("PUT", "remote", { enabled: !remote.enabled }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not change remote access")
    } finally {
      setBusy(false)
    }
  }

  const firewall = remote ? `netsh advfirewall firewall add rule name="Argus" dir=in action=allow protocol=TCP localport=${remote.port}` : ""

  return (
    <section id="section-remote" aria-labelledby="section-remote-title" className="scroll-mt-6">
      <h2 id="section-remote-title" className="text-sm font-semibold">
        Remote access
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Let your staff open the panel from their own computers, with their logins.</p>

      {!live || !remote ? (
        <p className="mt-4 rounded-xl bg-muted px-3 py-3 text-xs text-muted-foreground">
          {live ? "Only admins and the owner see this." : "Start Argus to change remote access."}
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground/90">Open the panel to other computers</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {remote.enabled ? `Listening on port ${remote.port} on every network of this machine.` : "Only this machine can open the panel now."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={remote.enabled}
              aria-label="Open the panel to other computers"
              onClick={() => void toggle()}
              disabled={!owner || busy}
              className={cn(
                "relative mt-0.5 h-5 w-9 shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45",
                remote.enabled ? "bg-foreground" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-xs transition-transform duration-200 ease-out motion-reduce:transition-none",
                  remote.enabled && "translate-x-4",
                )}
              />
            </button>
          </div>
          {!owner ? <p className="text-xs text-muted-foreground">Only the owner can turn this on or off.</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          {remote.enabled ? (
            <>
              <div className="rounded-xl border border-border/70 px-3 py-2.5 text-xs">
                <p className="font-medium text-foreground/90">Your staff opens</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {[...remote.addresses.map((address) => `http://${address}:${remote.port}`), `http://<public IP of this machine>:${remote.port}`].map((url) => (
                    <li key={url} className="group flex items-center justify-between gap-2 font-mono text-[12px]">
                      <span className="truncate">{url}</span>
                      {url.includes("<") ? null : <CopyButton value={url} label={`Copy ${url}`} />}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2.5 text-xs">
                <p className="font-medium text-foreground/90">Allow the port through the firewall</p>
                <p className="mt-1 text-muted-foreground">
                  On a Windows VPS, run this once in an administrator PowerShell. Also open TCP {remote.port} in your host&apos;s firewall panel, if it has one.
                </p>
                <div className="group mt-2 flex items-center gap-2 rounded-lg bg-background px-2.5 py-1.5 font-mono text-[11px]">
                  <span className="min-w-0 flex-1 break-all">{firewall}</span>
                  <CopyButton value={firewall} label="Copy the firewall command" />
                </div>
              </div>
              <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-xs text-warning">
                <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="mt-px size-3.5 shrink-0" />
                Over plain http, passwords cross the internet unencrypted. For use outside your home network, put Argus behind HTTPS, for example a Cloudflare Tunnel.
              </p>
            </>
          ) : null}
        </div>
      )}
    </section>
  )
}
