"use client"

import { useId, useMemo, useState, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon, Folder01Icon, PackageIcon } from "@hugeicons/core-free-icons"

import { useLiveServer } from "@/components/live-server"
import { useSettings } from "@/components/settings-store"
import { BAN_DURATIONS } from "@/lib/bans"
import { handleRadioKeyDown } from "@/lib/radio-group"
import {
  addStartupEntry,
  BAN_MESSAGE_TOKENS,
  folderMembers,
  isFolderEntry,
  MAX_RESTART_TIMES,
  NEXT_START_KEYS,
  normalizeTime,
  NUMERIC_LIMITS,
  RESOURCE_FOLDERS,
  renderBanMessage,
  SECTIONS,
  startupCoverage,
  startupEntryError,
  validateSettings,
  WARNING_MINUTES,
  type NumericKey,
  type SectionId,
  type SettingErrors,
  type SettingKey,
} from "@/lib/settings"
import { RESOURCE_CATALOG } from "@/lib/resources"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"

import { ArtifactSettings } from "./artifact-settings"
import { RemoteSettings } from "./remote-settings"
import { RepositorySettings } from "./repository-settings"
import { TeamSettings } from "./team-settings"

const INPUT =
  "h-9 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"

const MONO_INPUT = cn(INPUT, "font-mono text-[13px]")

const SMALL_BUTTON =
  "press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"

const ICON_BUTTON =
  "press grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35"

const SECTION_OF = new Map<SettingKey, SectionId>(SECTIONS.flatMap((section) => section.keys.map((key) => [key, section.id] as const)))

export function SettingsPage() {
  const { draft, changed, update, discard, save } = useSettings()
  const live = useLiveServer()
  const [showErrors, setShowErrors] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const errors = useMemo(() => validateSettings(draft), [draft])
  const visibleErrors: SettingErrors = showErrors ? errors : {}
  const errorCount = Object.keys(errors).length
  const changedSections = new Set(changed.map((key) => SECTION_OF.get(key)))

  function handleSave() {
    if (errorCount) {
      setShowErrors(true)
      const first = Object.keys(errors)[0]
      document.getElementById(`setting-${first}`)?.focus()
      return
    }
    const needsStart = changed.some((key) => NEXT_START_KEYS.includes(key))
    const count = changed.length
    setShowErrors(false)
    save()
      .then(() => {
        live.logAction(`updated ${count === 1 ? "a setting" : `${count} settings`}`)
        setSavedNote(needsStart ? t("Saved. Launch and startup changes apply the next time the server starts.") : "Saved.")
      })
      .catch(() => setSavedNote("Could not save. Is the Argus agent running?"))
  }

  function handleDiscard() {
    discard()
    setShowErrors(false)
  }

  function field<Key extends SettingKey>(key: Key) {
    return {
      id: `setting-${key}`,
      error: visibleErrors[key],
      changed: changed.includes(key),
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="border-b border-border/70 px-5 py-3">
        <h1 className="truncate text-sm font-semibold">{t("Settings")}</h1>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t("Saved on this machine. Only this Argus install reads them.")}</p>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label={t("Settings sections")} className="hidden w-52 shrink-0 border-r border-border/70 p-2 lg:block">
          <ul className="flex flex-col gap-0.5">
            <li>
              <a
                href="#section-team"
                className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("Team")}
              </a>
            </li>
            <li>
              <a
                href="#section-remote"
                className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("Remote access")}
              </a>
            </li>
            <li>
              <a
                href="#section-artifacts"
                className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                FXServer
              </a>
            </li>
            <li>
              <a
                href="#section-repository"
                className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("Repository")}
              </a>
            </li>
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#section-${section.id}`}
                  className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex-1">{t(section.label)}</span>
                  {changedSections.has(section.id) ? <span className="size-1.5 rounded-full bg-warning" aria-label={t("Unsaved changes")} /> : null}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
          <div className="mx-auto flex max-w-2xl flex-col gap-10 px-5 py-6 pb-28">
            <TeamSettings />

            <RemoteSettings />

            <ArtifactSettings />

            <RepositorySettings />

            <SettingsSection id="server">
              <TextField label={t("Server name")} hint={t("Shown in the sidebar and the console log file name.")} {...field("name")}>
                <input
                  id="setting-name"
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                  aria-invalid={Boolean(visibleErrors.name)}
                  spellCheck={false}
                  className={INPUT}
                />
              </TextField>
              <TextField label={t("FXServer executable")} hint={t("FXServer.exe on Windows, run.sh on Linux.")} {...field("executable")}>
                <input
                  id="setting-executable"
                  value={draft.executable}
                  onChange={(event) => update({ executable: event.target.value })}
                  aria-invalid={Boolean(visibleErrors.executable)}
                  spellCheck={false}
                  className={MONO_INPUT}
                />
              </TextField>
              <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
                <TextField label={t("Server data folder")} hint={t("The folder with server.cfg and resources.")} {...field("dataFolder")}>
                  <input
                    id="setting-dataFolder"
                    value={draft.dataFolder}
                    onChange={(event) => update({ dataFolder: event.target.value })}
                    aria-invalid={Boolean(visibleErrors.dataFolder)}
                    spellCheck={false}
                    className={MONO_INPUT}
                  />
                </TextField>
                <TextField label={t("Config file")} {...field("configFile")}>
                  <input
                    id="setting-configFile"
                    value={draft.configFile}
                    onChange={(event) => update({ configFile: event.target.value })}
                    aria-invalid={Boolean(visibleErrors.configFile)}
                    spellCheck={false}
                    className={MONO_INPUT}
                  />
                </TextField>
              </div>
              <TextField label={t("Extra launch arguments")} hint={t("Passed to FXServer after +exec. Leave empty if server.cfg already sets them.")} {...field("launchArgs")}>
                <input
                  id="setting-launchArgs"
                  value={draft.launchArgs}
                  onChange={(event) => update({ launchArgs: event.target.value })}
                  spellCheck={false}
                  placeholder="+set onesync on"
                  className={MONO_INPUT}
                />
              </TextField>
              <SwitchField
                id="setting-autoStart"
                label={t("Start the server with Argus")}
                hint={t("When Argus opens, it starts FXServer right away.")}
                checked={draft.autoStart}
                changed={changed.includes("autoStart")}
                onChange={(autoStart) => update({ autoStart })}
              />
            </SettingsSection>

            <SettingsSection id="startup">
              <StartupList value={draft.startup} changed={changed.includes("startup")} onChange={(startup) => update({ startup })} />
            </SettingsSection>

            <SettingsSection id="restarts">
              <RestartTimes value={draft.restartTimes} changed={changed.includes("restartTimes")} onChange={(restartTimes) => update({ restartTimes })} />
              <div className="grid gap-2">
                <FieldLabel label={t("Warn players before")} changed={changed.includes("restartWarnings")} />
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Warn players before")}>
                  {WARNING_MINUTES.map((minutes) => {
                    const on = draft.restartWarnings.includes(minutes)
                    return (
                      <button
                        key={minutes}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          update({
                            restartWarnings: on
                              ? draft.restartWarnings.filter((value) => value !== minutes)
                              : [...draft.restartWarnings, minutes].sort((first, second) => second - first),
                          })
                        }
                        className={cn(
                          "press h-7 rounded-lg px-2.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          on ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {minutes} min
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {draft.restartWarnings.length
                    ? t("Players see a chat warning {list} minutes before each restart.", { list: draft.restartWarnings.join(", ") })
                    : t("Players get no warning before a scheduled restart.")}
                </p>
              </div>
            </SettingsSection>

            <SettingsSection id="watchdog">
              <SwitchField
                id="setting-restartOnCrash"
                label={t("Restart after a crash or hang")}
                hint={t("Waits 2 s, then doubles the wait after each failed start, up to 60 s.")}
                checked={draft.restartOnCrash}
                changed={changed.includes("restartOnCrash")}
                onChange={(restartOnCrash) => update({ restartOnCrash })}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <NumberField
                  name="maxFailedStarts"
                  label={t("Give up after")}
                  unit={t("failed starts")}
                  value={draft.maxFailedStarts}
                  disabled={!draft.restartOnCrash}
                  onChange={(maxFailedStarts) => update({ maxFailedStarts })}
                  {...field("maxFailedStarts")}
                />
                <NumberField
                  name="heartbeatTimeoutSeconds"
                  label={t("Hung after no heartbeat for")}
                  unit={t("seconds")}
                  value={draft.heartbeatTimeoutSeconds}
                  onChange={(heartbeatTimeoutSeconds) => update({ heartbeatTimeoutSeconds })}
                  {...field("heartbeatTimeoutSeconds")}
                />
                <NumberField
                  name="bootTimeoutSeconds"
                  label={t("Failed boot after")}
                  unit={t("seconds")}
                  value={draft.bootTimeoutSeconds}
                  onChange={(bootTimeoutSeconds) => update({ bootTimeoutSeconds })}
                  {...field("bootTimeoutSeconds")}
                />
                <NumberField
                  name="stopTimeoutSeconds"
                  label={t("Force stop after")}
                  unit={t("seconds")}
                  value={draft.stopTimeoutSeconds}
                  onChange={(stopTimeoutSeconds) => update({ stopTimeoutSeconds })}
                  {...field("stopTimeoutSeconds")}
                />
              </div>
            </SettingsSection>

            <SettingsSection id="bans">
              <div className="grid gap-2">
                <FieldLabel label={t("Default length for new bans")} changed={changed.includes("defaultBanDuration")} />
                <div className="flex w-fit items-center gap-0.5 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t("Default ban length")}>
                  {BAN_DURATIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={draft.defaultBanDuration === option}
                      tabIndex={draft.defaultBanDuration === option ? 0 : -1}
                      onClick={() => update({ defaultBanDuration: option })}
                      onKeyDown={handleRadioKeyDown}
                      className={cn(
                        "press h-7 rounded-lg px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        draft.defaultBanDuration === option ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <TextField
                label={t("Message a banned player sees")}
                hint={t("Use {list} to fill in the ban details.", { list: BAN_MESSAGE_TOKENS.join(", ") })}
                {...field("banMessage")}
              >
                <textarea
                  id="setting-banMessage"
                  value={draft.banMessage}
                  onChange={(event) => update({ banMessage: event.target.value })}
                  aria-invalid={Boolean(visibleErrors.banMessage)}
                  rows={3}
                  className={cn(INPUT, "h-auto resize-none py-2")}
                />
              </TextField>
              <div className="rounded-xl bg-muted px-3 py-2.5 text-xs">
                <p className="text-[11px] text-muted-foreground">{t("Preview")}</p>
                <p className="mt-1 wrap-break-word text-foreground/90">
                  {renderBanMessage(draft.banMessage.trim() || "…", { reason: "Cheating", expires: "in 7 days", id: "B-4094" })}
                </p>
              </div>
            </SettingsSection>
          </div>
        </div>
      </div>

      <SaveBar
        count={changed.length}
        errorCount={showErrors ? errorCount : 0}
        note={changed.length ? null : savedNote}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onDismissNote={() => setSavedNote(null)}
      />
    </div>
  )
}

function SettingsSection({ id, children }: { id: SectionId; children: ReactNode }) {
  const section = SECTIONS.find((entry) => entry.id === id)!
  return (
    <section id={`section-${id}`} aria-labelledby={`section-${id}-title`} className="scroll-mt-6">
      <h2 id={`section-${id}-title`} className="text-sm font-semibold">
        {t(section.label)}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{t(section.description)}</p>
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  )
}

function FieldLabel({ label, htmlFor, changed }: { label: string; htmlFor?: string; changed?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-medium text-foreground/90">
      {label}
      {changed ? <span className="size-1.5 rounded-full bg-warning" aria-label={t("Unsaved")} /> : null}
    </label>
  )
}

function TextField({
  id,
  label,
  hint,
  error,
  changed,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  changed?: boolean
  children: ReactNode
}) {
  return (
    <div className="grid content-start gap-1.5">
      <FieldLabel label={label} htmlFor={id} changed={changed} />
      {children}
      {error ? (
        <p className="text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function NumberField({
  id,
  name,
  label,
  unit,
  value,
  error,
  changed,
  disabled,
  onChange,
}: {
  id: string
  name: NumericKey
  label: string
  unit: string
  value: string
  error?: string
  changed?: boolean
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { min, max } = NUMERIC_LIMITS[name]
  return (
    <div className={cn("grid content-start gap-1.5", disabled && "opacity-45")}>
      <FieldLabel label={label} htmlFor={id} changed={changed} />
      <div className="flex items-center gap-2">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-range`}
          className={cn(MONO_INPUT, "w-24 tabular-nums")}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      {error ? (
        <p className="text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      ) : (
        <p id={`${id}-range`} className="font-mono text-[11px] text-muted-foreground">{t("{min} to {max}", { min, max })}</p>
      )}
    </div>
  )
}

function SwitchField({
  id,
  label,
  hint,
  checked,
  changed,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  changed?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <FieldLabel label={label} htmlFor={id} changed={changed} />
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
          checked ? "bg-foreground" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-xs transition-transform duration-200 ease-out motion-reduce:transition-none",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  )
}

function StartupList({ value, changed, onChange }: { value: string[]; changed: boolean; onChange: (value: string[]) => void }) {
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const listId = useId()
  const covered = startupCoverage(value)
  const left = RESOURCE_CATALOG.filter((entry) => !covered.has(entry.name))
  const folderSuggestions = RESOURCE_FOLDERS.filter((folder) => !value.includes(folder))

  function add(raw: string) {
    const entry = raw.trim()
    const problem = startupEntryError(entry, value)
    if (problem) {
      setError(problem)
      return
    }
    onChange(addStartupEntry(value, entry))
    setInput("")
    setError(null)
  }

  function move(index: number, step: -1 | 1) {
    const next = [...value]
    const [entry] = next.splice(index, 1)
    next.splice(index + step, 0, entry)
    onChange(next)
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel label={t("Ensure on start")} changed={changed} />
        <span className="font-mono text-[11px] whitespace-pre text-muted-foreground">{t("{count} of {total} resources", { count: covered.size, total: RESOURCE_CATALOG.length })}</span>
      </div>

      {value.length === 0 ? (
        <p className="rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          {t("Nothing starts with the server. Add a [folder] or a resource below.")}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/70">
          {value.map((entry, index) => {
            const folder = isFolderEntry(entry)
            const members = folder ? folderMembers(entry) : []
            return (
              <li key={entry} className="flex h-11 items-center gap-2.5 pr-1.5 pl-3">
                <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{index + 1}</span>
                <HugeiconsIcon icon={folder ? Folder01Icon : PackageIcon} strokeWidth={1.75} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[13px] text-foreground/90">{`ensure ${entry}`}</span>
                  {folder ? <span className="block truncate text-[11px] text-muted-foreground">{members.join(", ")}</span> : null}
                </span>
                {folder ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{members.length}</span> : null}
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${entry} up`} className={ICON_BUTTON}>
                  <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={1.75} className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  aria-label={`Move ${entry} down`}
                  className={ICON_BUTTON}
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.75} className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((other) => other !== entry))}
                  aria-label={`Remove ${entry}`}
                  className={cn(ICON_BUTTON, "hover:text-destructive")}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          add(input)
        }}
        className="grid gap-1.5"
      >
        <label htmlFor="setting-startup" className="sr-only">
          Add a folder or resource
        </label>
        <div className="flex gap-2">
          <input
            id="setting-startup"
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              setError(null)
            }}
            list={listId}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={Boolean(error)}
            placeholder={t("[folder] or resource name")}
            className={MONO_INPUT}
          />
          <button type="submit" className={cn(SMALL_BUTTON, "h-9 border border-border hover:bg-muted")}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.75} className="size-3.5" />
            {t("Add")}
          </button>
        </div>
        <datalist id={listId}>
          {folderSuggestions.map((folder) => (
            <option key={folder} value={folder} />
          ))}
          {left.map((entry) => (
            <option key={entry.name} value={entry.name} />
          ))}
        </datalist>
        {error ? (
          <p className="text-xs text-destructive" aria-live="polite">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("A [folder] ensures every resource inside it, so new scripts dropped there start too. Order matters: dependencies go first.")}
          </p>
        )}
      </form>

      {folderSuggestions.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">{t("Folders not listed")}</span>
          {folderSuggestions.map((folder) => (
            <button
              key={folder}
              type="button"
              onClick={() => add(folder)}
              className="press h-6 rounded-md bg-muted px-2 font-mono text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {`+ ${folder}`}
            </button>
          ))}
        </div>
      ) : null}

      {left.length ? (
        <p className="text-xs text-muted-foreground">
          <span className="text-warning">{t("{count} not started on boot:", { count: left.length })}</span>{" "}
          <span className="font-mono text-[11px]">{left.map((entry) => entry.name).join(", ")}</span>
        </p>
      ) : null}
    </div>
  )
}

function RestartTimes({ value, changed, onChange }: { value: string[]; changed: boolean; onChange: (value: string[]) => void }) {
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const full = value.length >= MAX_RESTART_TIMES

  function add() {
    const time = normalizeTime(input)
    if (!time) {
      setError("Use 24-hour time, like 04:00 or 16:30.")
      return
    }
    if (value.includes(time)) {
      setError(`${time} is already on the schedule.`)
      return
    }
    onChange([...value, time].sort())
    setInput("")
    setError(null)
  }

  return (
    <div className="grid gap-2">
      <FieldLabel label={t("Restart every day at")} htmlFor="setting-restartTimes" changed={changed} />
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((time) => (
          <span key={time} className="inline-flex h-8 items-center gap-1 rounded-lg bg-muted pr-1 pl-2.5 font-mono text-xs tabular-nums">
            {time}
            <button type="button" onClick={() => onChange(value.filter((other) => other !== time))} aria-label={`Remove ${time}`} className={ICON_BUTTON}>
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} className="size-3" />
            </button>
          </span>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
          className="flex items-center gap-1.5"
        >
          <input
            id="setting-restartTimes"
            value={input}
            onChange={(event) => {
              setInput(event.target.value)
              setError(null)
            }}
            disabled={full}
            placeholder="HH:MM"
            inputMode="numeric"
            aria-invalid={Boolean(error)}
            className={cn(MONO_INPUT, "h-8 w-20 rounded-lg px-2")}
          />
          <button type="submit" disabled={full} className={cn(SMALL_BUTTON, "border border-border hover:bg-muted")}>
            {t("Add")}
          </button>
        </form>
      </div>
      {error ? (
        <p className="text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {value.length === 0
            ? t("No scheduled restarts. The server only restarts when you or the watchdog do it.")
            : full
              ? t("Up to {count} restarts a day.", { count: MAX_RESTART_TIMES })
              : t("Server time. Argus sends quit and starts FXServer again.")}
        </p>
      )}
    </div>
  )
}

function SaveBar({
  count,
  errorCount,
  note,
  onSave,
  onDiscard,
  onDismissNote,
}: {
  count: number
  errorCount: number
  note: string | null
  onSave: () => void
  onDiscard: () => void
  onDismissNote: () => void
}) {
  const visible = count > 0 || note !== null
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4 transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <div
        role="status"
        className={cn(
          "flex max-w-full items-center gap-3 rounded-2xl border border-border/70 bg-background py-2 pr-2 pl-4 shadow-lg shadow-black/5",
          visible && "pointer-events-auto",
        )}
      >
        {count > 0 ? (
          <>
            <p className="min-w-0 truncate text-xs">
              {errorCount ? (
                <span className="text-destructive">{errorCount === 1 ? t("Fix 1 field before saving") : t(`Fix ${errorCount} fields before saving`)}</span>
              ) : (
                <span className="text-foreground/90">{count === 1 ? t("1 unsaved change") : t(`${count} unsaved changes`)}</span>
              )}
            </p>
            <button type="button" onClick={onDiscard} tabIndex={visible ? 0 : -1} className={cn(SMALL_BUTTON, "hover:bg-muted")}>
              {t("Discard")}
            </button>
            <button type="button" onClick={onSave} tabIndex={visible ? 0 : -1} className={cn(SMALL_BUTTON, "bg-primary text-primary-foreground hover:bg-primary/85")}>
              {t("Save")}
            </button>
          </>
        ) : (
          <>
            <p className="min-w-0 text-xs text-foreground/90">{note}</p>
            <button type="button" onClick={onDismissNote} tabIndex={visible ? 0 : -1} aria-label={t("Dismiss")} className={ICON_BUTTON}>
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.75} className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
