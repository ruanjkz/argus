"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Loading03Icon } from "@hugeicons/core-free-icons"

import { agentCall, useAgent } from "@/components/agent-store"
import { ArgusMark } from "@/components/argus-mark"
import { LanguageSelect } from "@/components/language-select"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

const INPUT =
  "h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"

const PRIMARY =
  "press inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

export const MIN_PASSWORD = 10

export function passwordHint(password: string, username: string) {
  if (!password) return null
  if (password.length < MIN_PASSWORD) return t("{count} more characters", { count: MIN_PASSWORD - password.length })
  if (username && password.toLowerCase().includes(username.toLowerCase())) return t("Do not put your username in the password")
  return null
}

function AuthCard({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-panel px-4 py-12 sm:py-20">
      <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-background p-6 sm:p-7">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-muted">
            <ArgusMark id="auth" />
          </span>
          <span className="text-sm font-medium">Argus</span>
          <LanguageSelect className="ml-auto" />
        </div>
        <h1 className="mt-6 text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p>
        {children}
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string | null } & React.ComponentProps<"input">) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-foreground/90">
        {label}
      </label>
      <input id={id} className={INPUT} {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
      <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="mt-px size-3.5 shrink-0" />
      {message}
    </p>
  )
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy} className={PRIMARY}>
      {busy ? <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.75} className="size-4 animate-spin motion-reduce:animate-none" /> : null}
      {children}
    </button>
  )
}

export function LoginScreen() {
  const { refresh } = useAgent()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await agentCall("POST", "session", { username, password })
      refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Could not sign in"))
      setBusy(false)
    }
  }

  return (
    <AuthCard title={t("Sign in")} description={t("Use the account your server owner gave you.")}>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <Field id="login-username" label={t("Username")} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus spellCheck={false} autoCapitalize="none" required />
        <Field id="login-password" label={t("Password")} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        <ErrorNote message={error} />
        <SubmitButton busy={busy}>{t("Sign in")}</SubmitButton>
        <p className="text-xs text-pretty text-muted-foreground">{t("Forgot it? Ask the server owner to reset your password.")}</p>
      </form>
    </AuthCard>
  )
}

export function OwnerScreen() {
  const { refresh, canCreateOwner } = useAgent()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hint = passwordHint(password, username)
  const mismatch = confirm.length > 0 && confirm !== password

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (hint || mismatch) return
    setBusy(true)
    setError(null)
    try {
      await agentCall("POST", "accounts/owner", { username, password })
      refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Could not create the account"))
      setBusy(false)
    }
  }

  if (!canCreateOwner) {
    return (
      <AuthCard
        title={t("Argus needs an owner")}
        description={t("Open Argus on the machine where it runs to create the owner account. For safety this cannot be done from another computer.")}
      >
        <span />
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t("Create the owner account")} description={t("The owner controls everything and creates the logins for the rest of the staff.")}>
      <OwnerFields
        username={username}
        password={password}
        confirm={confirm}
        onUsername={setUsername}
        onPassword={setPassword}
        onConfirm={setConfirm}
        onSubmit={submit}
        error={error}
        busy={busy}
        action={t("Create account")}
      />
    </AuthCard>
  )
}

export function OwnerFields({
  username,
  password,
  confirm,
  onUsername,
  onPassword,
  onConfirm,
  onSubmit,
  error,
  busy,
  action,
}: {
  username: string
  password: string
  confirm: string
  onUsername: (value: string) => void
  onPassword: (value: string) => void
  onConfirm: (value: string) => void
  onSubmit?: (event: FormEvent) => void
  error?: string | null
  busy?: boolean
  action?: string
}) {
  const hint = passwordHint(password, username)
  const mismatch = confirm.length > 0 && confirm !== password
  const content = (
    <>
      <Field
        id="owner-username"
        label={t("Username")}
        value={username}
        onChange={(event) => onUsername(event.target.value.toLowerCase().replace(/\s/g, ""))}
        autoComplete="username"
        spellCheck={false}
        autoCapitalize="none"
        placeholder="ruan"
        hint={t("Lowercase letters, numbers, dots, dashes.")}
        required
      />
      <Field
        id="owner-password"
        label={t("Password")}
        type="password"
        value={password}
        onChange={(event) => onPassword(event.target.value)}
        autoComplete="new-password"
        hint={hint ?? t("At least {count} characters.", { count: MIN_PASSWORD })}
        aria-invalid={Boolean(hint)}
        required
      />
      <Field
        id="owner-confirm"
        label={t("Repeat the password")}
        type="password"
        value={confirm}
        onChange={(event) => onConfirm(event.target.value)}
        autoComplete="new-password"
        hint={mismatch ? t("The passwords do not match") : null}
        aria-invalid={mismatch}
        required
      />
    </>
  )
  if (!onSubmit) return <div className="grid gap-4">{content}</div>
  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-4">
      {content}
      <ErrorNote message={error ?? null} />
      <SubmitButton busy={Boolean(busy)}>{action}</SubmitButton>
    </form>
  )
}

export function ChangePasswordForm({ forced, onDone }: { forced: boolean; onDone: () => void }) {
  const { account } = useAgent()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hint = passwordHint(next, account?.username ?? "")
  const mismatch = confirm.length > 0 && confirm !== next

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (hint || mismatch || next.length < MIN_PASSWORD) return
    setBusy(true)
    setError(null)
    try {
      await agentCall("POST", "session/password", { current, next })
      onDone()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Could not change the password"))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={cn("grid gap-4", forced && "mt-6")}>
      <Field
        id="password-current"
        label={forced ? t("Temporary password") : t("Current password")}
        type="password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        autoComplete="current-password"
        autoFocus
        required
      />
      <Field
        id="password-next"
        label={t("New password")}
        type="password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
        autoComplete="new-password"
        hint={hint ?? t("At least {count} characters.", { count: MIN_PASSWORD })}
        aria-invalid={Boolean(hint)}
        required
      />
      <Field
        id="password-confirm"
        label={t("Repeat the new password")}
        type="password"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        autoComplete="new-password"
        hint={mismatch ? t("The passwords do not match") : null}
        aria-invalid={mismatch}
        required
      />
      <ErrorNote message={error} />
      <SubmitButton busy={busy}>{t("Save new password")}</SubmitButton>
    </form>
  )
}

export function PasswordScreen() {
  const { account, refresh, signOut } = useAgent()
  return (
    <AuthCard
      title={t("Pick your own password")}
      description={t("Welcome{name}. You signed in with a temporary password. Choose a new one to continue.", { name: account ? `, ${account.username}` : "" })}
    >
      <ChangePasswordForm forced onDone={refresh} />
      <button
        type="button"
        onClick={() => void signOut()}
        className="press mt-3 h-9 w-full rounded-xl text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("Sign out")}
      </button>
    </AuthCard>
  )
}
