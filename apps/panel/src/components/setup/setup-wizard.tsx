"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Folder01Icon, Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { agentCall } from "@/components/agent-store"
import { ArgusMark } from "@/components/argus-mark"
import { MIN_PASSWORD, OwnerFields, passwordHint } from "@/components/auth/auth-screens"
import { cn } from "@/lib/utils"

type Candidate = { dataFolder: string; name: string; executable: string | null }

type SetupInfo = { configured: boolean; platform: string; executableName: string; candidates: Candidate[]; needsOwner?: boolean }

type CheckResult = { ok: true; value: string } | { ok: false; message: string }

type Check = { dataFolder: CheckResult; executable: CheckResult | null; name: string | null; willEnsure: boolean }

type Phase = "idle" | "installing" | "starting" | "failed"

const PRIMARY =
  "press inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

const INPUT =
  "h-9 w-full rounded-xl border border-border bg-transparent px-3 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"

const CHECK_DELAY_MS = 350
const READY_POLL_MS = 700

export function SetupWizard() {
  const [info, setInfo] = useState<SetupInfo | null>(null)
  const [dataFolder, setDataFolder] = useState("")
  const [executable, setExecutable] = useState("")
  const [executableTouched, setExecutableTouched] = useState(false)
  const [name, setName] = useState("")
  const [nameTouched, setNameTouched] = useState(false)
  const [autoStart, setAutoStart] = useState(true)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [check, setCheck] = useState<Check | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)

  useEffect(() => {
    let cancelled = false
    agentCall<SetupInfo>("GET", "setup")
      .then((loaded) => {
        if (cancelled) return
        setInfo(loaded)
        const first = loaded.candidates[0]
        if (loaded.candidates.length === 1 && first) setDataFolder(first.dataFolder)
      })
      .catch(() => setInfo({ configured: false, platform: "win32", executableName: "FXServer.exe", candidates: [] }))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!dataFolder.trim()) return
    const id = ++request.current
    const timer = window.setTimeout(() => {
      agentCall<Check>("POST", "setup/check", { dataFolder, executable: executableTouched ? executable : "" })
        .then((result) => {
          if (id !== request.current) return
          setCheck(result)
          if (!executableTouched && result.executable?.ok) setExecutable(result.executable.value)
          if (!nameTouched && result.name) setName(result.name)
        })
        .catch(() => undefined)
    }, CHECK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [dataFolder, executable, executableTouched, nameTouched])

  const folderOk = check?.dataFolder.ok === true && dataFolder.trim() !== ""
  const executableOk = check?.executable?.ok === true
  const needsOwner = info?.needsOwner !== false
  const ownerOk = !needsOwner || (username.length >= 2 && password.length >= MIN_PASSWORD && !passwordHint(password, username) && confirm === password)
  const ready = folderOk && executableOk && ownerOk && phase !== "installing" && phase !== "starting"
  const executableName = info?.executableName ?? "FXServer.exe"

  async function install(event: FormEvent) {
    event.preventDefault()
    if (!ready || !check?.dataFolder.ok || !check.executable?.ok) return
    setPhase("installing")
    setError(null)
    try {
      await agentCall("POST", "setup/install", {
        dataFolder: check.dataFolder.value,
        executable: check.executable.value,
        name,
        autoStart,
        username,
        password,
      })
      setPhase("starting")
      for (;;) {
        await new Promise((resolve) => window.setTimeout(resolve, READY_POLL_MS))
        try {
          await agentCall("GET", "state")
          window.location.reload()
          return
        } catch {
          continue
        }
      }
    } catch (failure) {
      setPhase("failed")
      setError(failure instanceof Error ? failure.message : "Setup failed")
    }
  }

  return (
    <div className="flex min-h-dvh items-start justify-center bg-panel px-4 py-10 sm:py-16">
      <form onSubmit={install} className="w-full max-w-xl rounded-2xl border border-border/70 bg-background p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-muted">
            <ArgusMark id="setup" />
          </span>
          <span className="text-sm font-medium">Argus</span>
        </div>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Set up your server</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Pick the server Argus should manage. Nothing changes until you click Install, and your server is not touched before that.
        </p>

        <fieldset className="mt-7">
          <legend className="text-sm font-medium">1. Your server</legend>
          {info === null ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" />
              Looking for servers on this machine
            </p>
          ) : info.candidates.length ? (
            <div className="mt-3 flex flex-col gap-1.5" role="radiogroup" aria-label="Servers found on this machine">
              {info.candidates.map((candidate) => {
                const selected = candidate.dataFolder === dataFolder
                return (
                  <button
                    key={candidate.dataFolder}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setDataFolder(candidate.dataFolder)
                      setExecutableTouched(false)
                      setNameTouched(false)
                    }}
                    className={cn(
                      "press flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "border-foreground/40 bg-muted" : "border-border hover:bg-muted/60",
                    )}
                  >
                    <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.75} className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{candidate.name}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{candidate.dataFolder}</span>
                    </span>
                    {selected ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4 shrink-0 text-success" /> : null}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">No server found automatically. Paste the folder below.</p>
          )}

          <label htmlFor="setup-folder" className="mt-4 block text-xs text-muted-foreground">
            {info?.candidates.length ? "Or paste another server data folder" : "Server data folder, the one with server.cfg and resources"}
          </label>
          <input
            id="setup-folder"
            value={dataFolder}
            onChange={(event) => {
              setDataFolder(event.target.value)
              setExecutableTouched(false)
              setNameTouched(false)
              setCheck(null)
            }}
            spellCheck={false}
            autoComplete="off"
            placeholder={info?.platform === "win32" ? "C:\\FXServer\\server-data" : "/home/fivem/server-data"}
            aria-invalid={check?.dataFolder.ok === false}
            className={cn(INPUT, "mt-1.5")}
          />
          <FieldNote result={dataFolder.trim() ? (check?.dataFolder ?? null) : null} okText="Found server.cfg and resources" />
        </fieldset>

        <fieldset className="mt-6" disabled={!folderOk}>
          <legend className={cn("text-sm font-medium", !folderOk && "text-muted-foreground")}>2. {executableName}</legend>
          <input
            id="setup-executable"
            aria-label={`Path to ${executableName}`}
            value={executable}
            onChange={(event) => {
              setExecutable(event.target.value)
              setExecutableTouched(true)
            }}
            spellCheck={false}
            autoComplete="off"
            placeholder={folderOk ? `Path to ${executableName}, or the folder that has it` : "Pick your server first"}
            aria-invalid={folderOk && check?.executable?.ok === false}
            className={cn(INPUT, "mt-3 disabled:opacity-45")}
          />
          {folderOk ? <FieldNote result={check?.executable ?? null} okText={executableTouched ? "Found it" : "Found it next to your server"} /> : null}
        </fieldset>

        {folderOk && executableOk ? (
          <fieldset className="mt-6">
            <legend className="text-sm font-medium">3. Install</legend>
            <label htmlFor="setup-name" className="mt-3 block text-xs text-muted-foreground">
              Name in the panel
            </label>
            <input
              id="setup-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setNameTouched(true)
              }}
              maxLength={32}
              spellCheck={false}
              className={cn(INPUT, "mt-1.5 font-sans text-sm")}
            />
            {needsOwner ? (
              <div className="mt-5">
                <p className="text-sm font-medium">Your owner account</p>
                <p className="mt-0.5 mb-3 text-xs text-muted-foreground">You sign in with it, and you create the logins for your staff later.</p>
                <OwnerFields
                  username={username}
                  password={password}
                  confirm={confirm}
                  onUsername={setUsername}
                  onPassword={setPassword}
                  onConfirm={setConfirm}
                />
              </div>
            ) : null}
            <div className="mt-4 rounded-xl bg-muted px-3.5 py-3 text-xs">
              <p className="font-medium text-foreground/90">Argus will</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-muted-foreground">
                <li>copy its small resource to resources/[argus]/argus</li>
                {check?.willEnsure ? <li>add ensure argus to server.cfg, keeping a copy as server.cfg.before-argus</li> : null}
                <li>save its settings in your user folder</li>
              </ul>
            </div>
            <label className="mt-4 flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} className="size-4 accent-foreground" />
              Start the server when I finish
            </label>
          </fieldset>
        ) : null}

        {error ? (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        <div className="mt-7 flex items-center gap-3">
          <button type="submit" disabled={!ready} className={PRIMARY}>
            {phase === "installing" || phase === "starting" ? (
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" />
            ) : null}
            {phase === "installing" ? "Installing" : phase === "starting" ? "Opening the panel" : "Install"}
          </button>
          {!ready && phase === "idle" ? (
            <span className="text-xs text-muted-foreground">
              {!folderOk ? "Pick your server to continue." : !executableOk ? `Point to ${executableName} to continue.` : "Create your owner account to continue."}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  )
}

function FieldNote({ result, okText }: { result: CheckResult | null; okText: string }) {
  if (!result) return <p className="mt-1.5 min-h-4 text-xs text-muted-foreground" />
  return (
    <p className={cn("mt-1.5 flex min-h-4 items-start gap-1.5 text-xs", result.ok ? "text-foreground/80" : "text-destructive")} aria-live="polite">
      {result.ok ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="mt-px size-3.5 shrink-0 text-success" /> : null}
      {result.ok ? okText : result.message}
    </p>
  )
}
