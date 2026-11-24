import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createServer } from "node:net"
import { join } from "node:path"
import { createInterface } from "node:readline"

import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"

import { argusFilePath, argusHome, createArgusFile, defaultSettings, readArgusFile, writeArgusFile } from "./home.ts"
import {
  checkDataFolder,
  checkExecutable,
  ensureInConfig,
  EXECUTABLE_NAMES,
  guessExecutable,
  guessName,
  hasEnsure,
  installResource,
  type Check
} from "./install.ts"
import { FAKE_SERVER_ENV, startArgus, VERSION } from "./runtime.ts"

const BOLD = "\u001b[1m"
const DIM = "\u001b[2m"
const GREEN = "\u001b[32m"
const RED = "\u001b[31m"
const YELLOW = "\u001b[33m"
const RESET = "\u001b[0m"

const OK = `${GREEN}✓${RESET}`
const FAIL = `${RED}✗${RESET}`
const WARN = `${YELLOW}!${RESET}`

type Flags = Map<string, string | true>

const parseFlags = (args: ReadonlyArray<string>): Flags => {
  const flags: Flags = new Map()
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? ""
    if (!arg.startsWith("--")) continue
    const [name = "", inline] = arg.slice(2).split("=", 2)
    const next = args[index + 1]
    if (inline !== undefined) flags.set(name, inline)
    else if (next !== undefined && !next.startsWith("--")) {
      flags.set(name, next)
      index += 1
    } else flags.set(name, true)
  }
  return flags
}

const text = (flags: Flags, name: string) => {
  const value = flags.get(name)
  return typeof value === "string" ? value : undefined
}

const help = () => {
  console.log(`
  ${BOLD}argus${RESET} ${VERSION}  FiveM server manager

  ${BOLD}argus${RESET}           Start Argus. The first time, it opens the setup in your browser.
  ${BOLD}argus init${RESET}      Set up from the terminal instead. Asks two questions.
  ${BOLD}argus start${RESET}     Same as argus.
  ${BOLD}argus doctor${RESET}    Check that everything Argus needs is in place.

  ${DIM}init     --data <folder> --fxserver <path> --name <name> --yes${RESET}
  ${DIM}start    --simulate  runs a fake FXServer, nothing touches your server${RESET}
  ${DIM}         --no-open   does not open the browser  --verbose${RESET}
  ${DIM}Config lives in ${argusFilePath()}. Set ARGUS_HOME to move it.${RESET}
`)
}

interface Prompt {
  question(text: string): Promise<string>
  close(): void
}

const createPrompt = (): Prompt => {
  const lines: Array<string> = []
  const waiting: Array<(line: string) => void> = []
  let closed = false
  const reader = createInterface({ input: process.stdin, terminal: false })
  reader.on("line", (line) => {
    const next = waiting.shift()
    if (next) next(line)
    else lines.push(line)
  })
  reader.on("close", () => {
    closed = true
    for (const next of waiting.splice(0)) next("")
  })
  return {
    question: (text) => {
      process.stdout.write(text)
      const line = lines.shift()
      if (line !== undefined) {
        process.stdout.write(`${line}\n`)
        return Promise.resolve(line)
      }
      if (closed) {
        process.stdout.write("\n")
        return Promise.reject(new Error("Input ended before setup finished"))
      }
      return new Promise((resolve) => waiting.push(resolve))
    },
    close: () => reader.close()
  }
}

const ask = async <A>(
  prompt: Prompt,
  question: string,
  check: (answer: string) => Check<A>,
  fallback?: string
): Promise<A> => {
  for (;;) {
    const hint = fallback ? ` ${DIM}(${fallback})${RESET}` : ""
    const answer = (await prompt.question(`  ${question}${hint}\n  ${DIM}›${RESET} `)).trim() || fallback || ""
    const result = check(answer)
    if (result.ok) return result.value
    console.log(`  ${FAIL} ${result.message}\n`)
  }
}

const init = async (flags: Flags) => {
  const home = argusHome()
  const existing = readArgusFile(home)
  const unattended = flags.has("yes")
  const prompt = createPrompt()

  try {
    console.log(`\n  ${BOLD}Set up Argus${RESET}\n  ${DIM}Two questions, then Argus installs its resource and you are done.${RESET}\n`)
    if (existing && !unattended) {
      const answer = await prompt.question(`  Argus is already set up for ${BOLD}${existing.settings.name}${RESET}. Set it up again? ${DIM}(y/N)${RESET} `)
      if (!/^y/i.test(answer.trim())) return
    }

    const dataFlag = text(flags, "data")
    const dataFolder = dataFlag !== undefined
      ? unwrap(checkDataFolder(dataFlag))
      : await ask(prompt, `${BOLD}1/2${RESET} Where is your server data folder? ${DIM}It has server.cfg and resources.${RESET}`, checkDataFolder, existing?.settings.dataFolder)
    console.log(`  ${OK} ${dataFolder}\n`)

    const fxFlag = text(flags, "fxserver")
    const guess = existing?.settings.executable || guessExecutable(dataFolder)
    const executable = fxFlag !== undefined
      ? unwrap(checkExecutable(fxFlag))
      : await ask(prompt, `${BOLD}2/2${RESET} Where is ${EXECUTABLE_NAMES[0]}? ${DIM}The file or the folder that has it.${RESET}`, checkExecutable, guess)
    console.log(`  ${OK} ${executable}\n`)

    const name = text(flags, "name") ?? existing?.settings.name ?? guessName(dataFolder)
    const willEnsure = !hasEnsure(dataFolder)

    console.log(`  ${BOLD}Argus will${RESET}`)
    console.log(`    copy its resource to ${DIM}resources/[argus]/argus${RESET}`)
    if (willEnsure) console.log(`    add ${DIM}ensure argus${RESET} to the end of server.cfg ${DIM}(a copy is kept as server.cfg.before-argus)${RESET}`)
    console.log(`    save its settings to ${DIM}${argusFilePath(home)}${RESET}`)
    console.log(`  ${DIM}Your server is not started or stopped now.${RESET}\n`)

    if (!unattended) {
      const answer = await prompt.question(`  Go ahead? ${DIM}(Y/n)${RESET} `)
      if (/^n/i.test(answer.trim())) {
        console.log(`  ${DIM}Nothing was changed.${RESET}\n`)
        return
      }
    }

    const resource = installResource(dataFolder)
    console.log(`  ${OK} ${resource.updated ? "Updated" : "Installed"} the argus resource`)
    const config = ensureInConfig(dataFolder)
    console.log(`  ${OK} ${config.changed ? "Added ensure argus to server.cfg" : "server.cfg already ensures argus"}`)
    const settings = existing
      ? { ...existing.settings, name, executable, dataFolder }
      : defaultSettings(executable, dataFolder, name)
    writeArgusFile(existing ? { ...existing, settings } : createArgusFile(settings), home)
    console.log(`  ${OK} Saved settings for ${BOLD}${name}${RESET}`)
    console.log(`\n  Done. Start everything with ${BOLD}argus start${RESET}\n`)
  } finally {
    prompt.close()
  }
}

const unwrap = <A>(check: Check<A>): A => {
  if (check.ok) return check.value
  console.log(`  ${FAIL} ${check.message}\n`)
  process.exit(1)
}

const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const server = createServer()
    server.once("error", () => resolve(false))
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)))
  })

const commandWorks = (command: string, args: Array<string>) => {
  try {
    execFileSync(command, args, { stdio: "ignore", windowsHide: true })
    return true
  } catch {
    return false
  }
}

const doctor = async () => {
  const home = argusHome()
  const rows: Array<[boolean | "warn", string, string | undefined]> = []
  const [major = 0] = process.versions.node.split(".").map(Number)
  rows.push([major >= 22, `Node.js ${process.versions.node}`, major >= 22 ? undefined : "Install Node.js 22 or newer."])
  rows.push([commandWorks("git", ["--version"]) ? true : "warn", "git", "Needed for deploys. Install Git."])
  rows.push([existsSync(join(process.env.SystemRoot ?? "", "System32", "OpenSSH", "ssh-keygen.exe")) || commandWorks("ssh-keygen", ["-?"]) || commandWorks("ssh", ["-V"]) ? true : "warn", "ssh-keygen", "Needed to connect a repository. Install OpenSSH."])

  const file = (() => {
    try {
      return readArgusFile(home)
    } catch {
      return undefined
    }
  })()
  rows.push([Boolean(file), `Settings ${argusFilePath(home)}`, "Run argus init."])
  if (file) {
    const data = checkDataFolder(file.settings.dataFolder, file.settings.configFile)
    rows.push([data.ok, `Server data ${file.settings.dataFolder}`, data.ok ? undefined : data.message])
    const exe = checkExecutable(file.settings.executable)
    rows.push([exe.ok, `FXServer ${file.settings.executable}`, exe.ok ? undefined : exe.message])
    if (data.ok) {
      rows.push([existsSync(join(file.settings.dataFolder, "resources", "[argus]", "argus", "fxmanifest.lua")), "argus resource installed", "Run argus init again."])
      rows.push([hasEnsure(file.settings.dataFolder, file.settings.configFile), "server.cfg ensures argus", "Add ensure argus to server.cfg."])
    }
    rows.push([(await portFree(file.panelPort)) ? true : "warn", `Port ${file.panelPort} free for the panel`, "Something already uses it. Is Argus running?"])
  }

  console.log("")
  for (const [state, label, fix] of rows) {
    const icon = state === true ? OK : state === "warn" ? WARN : FAIL
    console.log(`  ${icon} ${label}${state === true || !fix ? "" : `\n    ${DIM}${fix}${RESET}`}`)
  }
  const failed = rows.some(([state]) => state === false)
  console.log(failed ? `\n  ${FAIL} Fix the items above, then run argus doctor again.\n` : `\n  ${OK} Ready. Run ${BOLD}argus start${RESET}\n`)
  if (failed) process.exitCode = 1
}

const main = async () => {
  const args = process.argv.slice(2)
  const [command = "start", ...rest] = args[0]?.startsWith("--") && !["--help", "--version"].includes(args[0]) ? ["start", ...args] : args
  const flags = parseFlags(rest)
  switch (command) {
    case "init":
      return init(flags)
    case "doctor":
      return doctor()
    case "start":
      return NodeRuntime.runMain(
        startArgus({ home: argusHome(), simulate: flags.has("simulate"), open: !flags.has("no-open"), verbose: flags.has("verbose") }).pipe(
          Effect.catch((error) => Effect.sync(() => {
            console.log(`\n  ${FAIL} ${error instanceof Error ? error.message : String(error)}\n`)
            process.exitCode = 1
          }))
        )
      )
    case "version":
    case "--version":
      return console.log(VERSION)
    case "help":
    case "--help":
      return help()
    default:
      console.log(`\n  ${FAIL} Unknown command ${command}`)
      return help()
  }
}

if (process.env[FAKE_SERVER_ENV]) {
  void import("../fixtures/fake-fxserver.mjs")
} else {
  main().catch((error: unknown) => {
    console.log(`\n  ${FAIL} ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
