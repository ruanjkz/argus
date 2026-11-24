"use client"

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon, Copy01Icon, Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { useAgent } from "@/components/agent-store"
import { useDeploys } from "@/components/deploys-store"
import { IconSwap } from "@/components/motion-primitives"
import { useSettings } from "@/components/settings-store"
import { BRANCHES } from "@/lib/deploys"
import { handleRadioKeyDown } from "@/lib/radio-group"
import { DEPLOY_PUBLIC_KEY, FAILURE_COPY, hostName, parseRemote, type ConnectionFailure, type Remote } from "@/lib/repository"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

type Step = 1 | 2 | 3

type TestState = { phase: "idle" } | { phase: "testing" } | { phase: "failed"; failure: ConnectionFailure } | { phase: "ok"; branches: string[] }

const TEST_MS = 1400

const PRIMARY =
  "press inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

const SECONDARY =
  "press inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

export function ConnectWizard() {
  const { connect } = useDeploys()
  const agent = useAgent()
  const live = agent.mode === "live"
  const [key, setKey] = useState<{ publicKey: string; fingerprint: string } | null>(null)
  const [keyError, setKeyError] = useState<string | null>(null)
  const { name: serverName } = useSettings().settings
  const [step, setStep] = useState<Step>(1)
  const [url, setUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [everCopied, setEverCopied] = useState(false)
  const [test, setTest] = useState<TestState>({ phase: "idle" })
  const [branch, setBranch] = useState("main")
  const timers = useRef<number[]>([])
  const remote = parseRemote(url)
  const host = remote ? hostName(remote) : "GitHub"

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => window.clearTimeout(timer))
  }, [])

  function later(delay: number, run: () => void) {
    timers.current.push(window.setTimeout(run, delay))
  }

  function submitUrl(event: FormEvent) {
    event.preventDefault()
    if (!remote) return
    setStep(2)
    if (!live || key) return
    agent
      .call<{ publicKey: string; fingerprint: string }>("POST", "git/key")
      .then((created) => {
        setKey(created)
        setKeyError(null)
      })
      .catch((error: unknown) => setKeyError(error instanceof Error ? error.message : "Could not create the key"))
  }

  async function copyKey() {
    setEverCopied(true)
    setCopied(true)
    later(1600, () => setCopied(false))
    try {
      await navigator.clipboard.writeText(key?.publicKey ?? DEPLOY_PUBLIC_KEY)
    } catch {
      return
    }
  }

  function runTest() {
    setStep(3)
    setTest({ phase: "testing" })
    if (live && remote) {
      agent
        .call<{ ok: true; branches: string[] } | { ok: false; reason: ConnectionFailure }>("POST", "git/test", { url: remote.sshUrl })
        .then((result) => {
          if (!result.ok) {
            setTest({ phase: "failed", failure: result.reason in FAILURE_COPY ? result.reason : "unknown" })
            return
          }
          const branches = result.branches.length ? result.branches : ["main"]
          setBranch(branches.includes("main") ? "main" : branches.includes("master") ? "master" : branches[0])
          setTest({ phase: "ok", branches })
        })
        .catch(() => setTest({ phase: "failed", failure: "unknown" }))
      return
    }
    later(TEST_MS, () => {
      if (!everCopied) {
        setTest({ phase: "failed", failure: "key-not-added" })
        return
      }
      const branches = BRANCHES.map((entry) => entry.name)
      setBranch(branches.includes("main") ? "main" : (branches[0] ?? "main"))
      setTest({ phase: "ok", branches })
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-5 py-10">
        <h2 className="text-base font-semibold">{t("Connect your repository")}</h2>
        <p className="mt-1 text-xs text-pretty text-muted-foreground">
          {t("Three steps, about two minutes. Argus gets read access to this one repository and nothing else. No account login, no token.")}
        </p>

        <ol className="mt-8 flex flex-col gap-3">
          <StepCard
            number={1}
            current={step}
            title={t("Paste the repository link")}
            summary={remote ? `${remote.owner}/${remote.name} on ${host}` : ""}
            onEdit={() => setStep(1)}
          >
            <form onSubmit={submitUrl} className="grid gap-2">
              <label htmlFor="connect-url" className="sr-only">
                {t("Repository link")}
              </label>
              <input
                id="connect-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                placeholder="https://github.com/your-name/your-server"
                className="h-9 w-full rounded-xl border border-border bg-transparent px-3 font-mono text-[13px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
                {remote ? (
                  <span className="inline-flex items-center gap-1.5 text-foreground/90">
                    <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5 text-success" />
                    <span className="font-mono text-[12px]">{`${remote.owner}/${remote.name}`}</span> on {host}
                  </span>
                ) : url.trim() ? (
                  "That does not look like a repository link yet. It needs an owner and a name."
                ) : (
                  "Copy it from the address bar of your repository page. Private repositories work."
                )}
              </p>
              <div>
                <button type="submit" disabled={!remote} className={PRIMARY}>
                  {t("Continue")}
                </button>
              </div>
            </form>
          </StepCard>

          <StepCard number={2} current={step} title={t("Add this key on {host}", { host })} summary={t("Key added")} onEdit={() => setStep(2)}>
            {remote ? (
              keyError ? (
                <div role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-xs">
                  <p className="font-medium text-destructive">{t("Argus could not create the key")}</p>
                  <p className="mt-1 text-foreground/90">{keyError}. Run argus doctor to see what is missing.</p>
                </div>
              ) : live && !key ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                  <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" />
                  {t("Creating a key on this machine")}
                </p>
              ) : (
                <KeyStep
                  remote={remote}
                  host={host}
                  serverName={serverName}
                  publicKey={key?.publicKey ?? DEPLOY_PUBLIC_KEY}
                  copied={copied}
                  onCopy={copyKey}
                  onDone={runTest}
                />
              )
            ) : null}
          </StepCard>

          <StepCard number={3} current={step} title={t("Test the connection")} summary="">
            {test.phase === "testing" ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" />
                {t("Asking {host} for the branches", { host })}
              </p>
            ) : null}
            {test.phase === "failed" ? (
              <div role="alert">
                <div className="rounded-xl bg-destructive/10 px-3 py-2.5 text-xs">
                  <p className="font-medium text-destructive">{FAILURE_COPY[test.failure].title}</p>
                  <p className="mt-1 text-foreground/90">{FAILURE_COPY[test.failure].fix}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setStep(test.failure === "repository-not-found" ? 1 : 2)} className={PRIMARY}>
                    {test.failure === "repository-not-found" ? t("Check the link") : t("Back to the key")}
                  </button>
                  <button type="button" onClick={runTest} className={SECONDARY}>
                    {t("Test again")}
                  </button>
                </div>
              </div>
            ) : null}
            {test.phase === "ok" && remote ? (
              <div>
                <p className="flex items-center gap-2 text-xs text-foreground/90" role="status">
                  <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4 text-success" />
                  {`Connected. Found ${test.branches.length} ${test.branches.length === 1 ? "branch" : "branches"}.`}
                </p>
                <p id="connect-branch" className="mt-4 text-xs font-medium text-foreground/90">
                  {t("Which branch runs on this server?")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="connect-branch">
                  {test.branches.map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={branch === name}
                      tabIndex={branch === name ? 0 : -1}
                      onClick={() => setBranch(name)}
                      onKeyDown={handleRadioKeyDown}
                      className={cn(
                        "press h-7 rounded-lg px-2.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        branch === name ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t("You can switch branches later on the Deploys page.")}</p>
                <button type="button" onClick={() => connect(remote, branch)} className={cn(PRIMARY, "mt-4")}>
                  {t("Finish")}
                </button>
              </div>
            ) : null}
          </StepCard>
        </ol>

        <p className="mt-6 text-xs text-pretty text-muted-foreground">
          Nothing on the live server changes when you connect. Argus downloads the code next to it, test boots it, and only swaps it in at a
          restart.
        </p>
      </div>
    </div>
  )
}

function StepCard({
  number,
  current,
  title,
  summary,
  onEdit,
  children,
}: {
  number: Step
  current: Step
  title: string
  summary: string
  onEdit?: () => void
  children: ReactNode
}) {
  const state = number === current ? "active" : number < current ? "done" : "upcoming"
  return (
    <li
      aria-current={state === "active" ? "step" : undefined}
      className={cn("rounded-2xl border px-4 py-3.5", state === "active" ? "border-border bg-background" : "border-border/60")}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] tabular-nums",
            state === "done" ? "bg-success/15 text-success" : state === "active" ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}
        >
          {state === "done" ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5" /> : number}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cn("text-[13px] font-medium", state === "upcoming" && "text-muted-foreground")}>{title}</h3>
          {state === "done" && summary ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p> : null}
        </div>
        {state === "done" && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="press h-7 shrink-0 rounded-lg px-2 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("Change")}
          </button>
        ) : null}
      </div>
      {state === "active" ? <div className="mt-3.5 pl-9">{children}</div> : null}
    </li>
  )
}

function KeyStep({
  remote,
  host,
  serverName,
  publicKey,
  copied,
  onCopy,
  onDone,
}: {
  remote: Remote
  host: string
  serverName: string
  publicKey: string
  copied: boolean
  onCopy: () => void
  onDone: () => void
}) {
  return (
    <div>
      <p className="text-xs text-pretty text-muted-foreground">
        This key was made on this machine and only opens <span className="font-mono text-foreground/90">{`${remote.owner}/${remote.name}`}</span>,
        read only.
      </p>
      <div className="mt-3 rounded-xl bg-muted p-3">
        <p className="font-mono text-[11px] leading-relaxed break-all text-foreground/90 select-all">{publicKey}</p>
        <button type="button" onClick={onCopy} className={cn(PRIMARY, "mt-3")}>
          <IconSwap
            active={copied ? "b" : "a"}
            first={<HugeiconsIcon icon={Copy01Icon} strokeWidth={1.75} className="size-3.5" />}
            second={<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5" />}
          />
          {copied ? "Copied" : t("Copy the key")}
        </button>
      </div>

      <ol className="mt-4 flex flex-col gap-2.5 text-xs text-foreground/90">
        <Instruction index="a">
          Open the deploy keys page of the repository.
          {remote.deployKeysUrl ? (
            <a href={remote.deployKeysUrl} target="_blank" rel="noreferrer" className={cn(SECONDARY, "mt-2 w-fit")}>
              {t("Open {host}", { host })}
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={1.75} className="size-3.5" />
            </a>
          ) : (
            <span className="mt-1 block text-muted-foreground">{t("On most hosts it is under Settings, then Deploy keys.")}</span>
          )}
        </Instruction>
        <Instruction index="b">
          In <strong className="font-medium">Title</strong>, type <span className="font-mono text-[12px]">{`Argus ${serverName}`}</span>. In{" "}
          <strong className="font-medium">Key</strong>, paste what you copied.
        </Instruction>
        <Instruction index="c">
          Leave <strong className="font-medium">Allow write access</strong> unchecked and click <strong className="font-medium">Add key</strong>.
        </Instruction>
      </ol>

      <button type="button" onClick={onDone} className={cn(PRIMARY, "mt-4")}>
        {t("I added the key, test it")}
      </button>
    </div>
  )
}

function Instruction({ index, children }: { index: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="w-3 shrink-0 font-mono text-[11px] leading-5 text-muted-foreground">{index}</span>
      <span className="min-w-0 flex-1 leading-5">{children}</span>
    </li>
  )
}
