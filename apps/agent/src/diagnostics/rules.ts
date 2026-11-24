import type { CodeLocation, Diagnosis, ProblemKind } from "./model.ts"

export interface RuleContext {
  readonly kind: ProblemKind
  readonly resource: string | undefined
  readonly location: CodeLocation | undefined
  readonly message: string
}

interface Finding {
  readonly cause: string
  readonly steps: ReadonlyArray<string>
}

interface Rule {
  readonly id: string
  readonly kinds: ReadonlyArray<ProblemKind>
  readonly pattern?: RegExp
  readonly explain: (match: RegExpExecArray | undefined, context: RuleContext) => Finding
}

const place = (context: RuleContext) =>
  context.location ? `${context.location.resource}/${context.location.file}:${context.location.line}` : "that line"

const owner = (context: RuleContext) => context.resource ?? "the resource"

const named = (match: RegExpExecArray | undefined, scopeGroup: number, nameGroup: number) => {
  const name = match?.[nameGroup]
  return name === undefined ? undefined : `${match?.[scopeGroup] ?? "value"} "${name}"`
}

const CODE_KINDS: ReadonlyArray<ProblemKind> = ["script-error", "resource-error"]

export const RULES: ReadonlyArray<Rule> = [
  {
    id: "lua-index-nil",
    kinds: CODE_KINDS,
    pattern: /attempt to index a nil value(?: \((\w+) '([^']+)'\))?/,
    explain: (match, context) => {
      const subject = named(match, 1, 2)
      return {
        cause: subject
          ? `The ${subject} is nil when the code at ${place(context)} tries to read something inside it`
          : `A value is nil when the code at ${place(context)} tries to read something inside it`,
        steps: [
          `Find where it is set before ${place(context)} and handle the case where it is missing`,
          "If it comes from a config file or a database row, confirm that entry exists"
        ]
      }
    }
  },
  {
    id: "lua-call-nil",
    kinds: CODE_KINDS,
    pattern: /attempt to call a nil value(?: \((\w+) '([^']+)'\))?/,
    explain: (match, context) => {
      const subject = named(match, 1, 2)
      return {
        cause: subject
          ? `The ${subject} is not a function when ${place(context)} calls it`
          : `The code at ${place(context)} calls a function that does not exist`,
        steps: [
          "Check the spelling and that the file defining it is listed earlier in fxmanifest.lua",
          `If it comes from another resource, make sure that resource starts before ${owner(context)}`
        ]
      }
    }
  },
  {
    id: "lua-arithmetic",
    kinds: CODE_KINDS,
    pattern: /attempt to perform arithmetic on a (\w+) value(?: \((\w+) '([^']+)'\))?/,
    explain: (match, context) => ({
      cause: `${named(match, 2, 3) ?? "A value"} is ${match?.[1] ?? "nil"} where ${place(context)} expects a number`,
      steps: [
        "Give it a default number before the calculation",
        "If it comes from player input or the database, convert it with tonumber and check the result"
      ]
    })
  },
  {
    id: "lua-compare",
    kinds: CODE_KINDS,
    pattern: /attempt to compare (\w+) with (\w+)/,
    explain: (match, context) => ({
      cause: `The code at ${place(context)} compares a ${match?.[1] ?? "value"} with a ${match?.[2] ?? "value"}`,
      steps: ["Make sure both sides are the same type before comparing", "A nil side usually means a missing value earlier"]
    })
  },
  {
    id: "lua-concat",
    kinds: CODE_KINDS,
    pattern: /attempt to concatenate a (\w+) value(?: \((\w+) '([^']+)'\))?/,
    explain: (match, context) => ({
      cause: `${named(match, 2, 3) ?? "A value"} is ${match?.[1] ?? "nil"} when ${place(context)} joins it into a string`,
      steps: ["Wrap it in tostring or give it a default text", "Check why it is missing at that point"]
    })
  },
  {
    id: "lua-syntax",
    kinds: CODE_KINDS,
    pattern: /unexpected symbol near|expected near|unfinished string|malformed number|<eof> expected/,
    explain: (_match, context) => ({
      cause: `The file has a syntax error at ${place(context)}, so it never loaded`,
      steps: ["Fix the syntax at that line", `Run ensure ${owner(context)} again after saving`]
    })
  },
  {
    id: "export-missing",
    kinds: CODE_KINDS,
    pattern: /No such export (\S+) in resource ([\w-]+)/,
    explain: (match) => ({
      cause: `Resource ${match?.[2] ?? "the dependency"} does not provide the export ${match?.[1] ?? ""}`.trim(),
      steps: [
        `Make sure ${match?.[2] ?? "the dependency"} is started before the resource that calls it`,
        "Check that the export name matches the installed version"
      ]
    })
  },
  {
    id: "dependency-missing",
    kinds: CODE_KINDS,
    pattern: /Could not find dependency ([\w-]+) for resource ([\w-]+)/,
    explain: (match) => ({
      cause: `Resource ${match?.[2] ?? ""} depends on ${match?.[1] ?? "a resource"}, which is not installed`.replace("  ", " "),
      steps: [
        `Install ${match?.[1] ?? "the dependency"} in the resources folder`,
        "Check that the folder name matches the name in fxmanifest.lua"
      ]
    })
  },
  {
    id: "resource-start-failed",
    kinds: CODE_KINDS,
    pattern: /Couldn't start resource ([\w-]+)/,
    explain: (match) => ({
      cause: `Resource ${match?.[1] ?? ""} failed to start`.replace("  ", " "),
      steps: ["Read the error printed right before this line in the console", "Check fxmanifest.lua for missing files"]
    })
  },
  {
    id: "sql-missing-table",
    kinds: CODE_KINDS,
    pattern: /Table '([^']+)' doesn't exist|ER_NO_SUCH_TABLE/,
    explain: (match, context) => ({
      cause: match?.[1] ? `The database table ${match[1]} does not exist` : "A database table the resource needs does not exist",
      steps: [`Run the SQL file that ships with ${owner(context)}`, "Check that the resource points at the right database"]
    })
  },
  {
    id: "sql-connection",
    kinds: CODE_KINDS,
    pattern: /ECONNREFUSED|Access denied for user|ER_ACCESS_DENIED|Can't connect to MySQL/,
    explain: () => ({
      cause: "The server could not connect to the database",
      steps: ["Check that the database is running", "Check mysql_connection_string in server.cfg"]
    })
  },
  {
    id: "thread-hang",
    kinds: ["thread-hang"],
    explain: (_match, context) => ({
      cause: context.location
        ? `The server thread stopped responding inside ${place(context)}`
        : "The server thread stopped responding and no stack was captured",
      steps: [
        "Look for a loop without Wait or a blocking call at that line",
        "Split heavy work across ticks or move it to an async call"
      ]
    })
  },
  {
    id: "thread-hitch",
    kinds: ["hitch"],
    explain: () => ({
      cause: "The server thread stalled for longer than one frame",
      steps: [
        "Run the profiler while it happens to see which resource is busy",
        "Stalls right after a resource start or a database call usually point at that resource"
      ]
    })
  },
  {
    id: "port-in-use",
    kinds: ["port-in-use"],
    explain: () => ({
      cause: "Another process is already using the server port",
      steps: [
        "Stop the other FXServer or program that holds the port",
        "Or change endpoint_add_tcp and endpoint_add_udp in server.cfg"
      ]
    })
  },
  {
    id: "boot-timeout",
    kinds: ["boot-timeout"],
    explain: () => ({
      cause: "The server process started but never sent a heartbeat",
      steps: ["Add ensure argus to server.cfg", "Check the console for errors while resources start"]
    })
  },
  {
    id: "heartbeat-lost",
    kinds: ["heartbeat-lost"],
    explain: () => ({
      cause: "Heartbeats stopped while the server process was still running",
      steps: ["Check the hung thread problem reported right before this one", "The server was restarted to recover"]
    })
  },
  {
    id: "crashed",
    kinds: ["crashed"],
    explain: () => ({
      cause: "FXServer exited on its own",
      steps: [
        "Read the last error lines before the exit in the console",
        "If it started after an update, roll back the artifact or the last deploy"
      ]
    })
  },
  {
    id: "spawn-failed",
    kinds: ["spawn-failed"],
    explain: () => ({
      cause: "FXServer could not be started",
      steps: ["Check the FXServer path in the agent settings", "Check that the agent can read and run that file"]
    })
  },
  {
    id: "crash-loop",
    kinds: ["crash-loop"],
    explain: () => ({
      cause: "The server failed to start several times in a row, so the agent stopped trying",
      steps: ["Fix the first failure in this list", "Start the server again from the panel"]
    })
  }
]

export const diagnose = (context: RuleContext): Diagnosis | undefined => {
  for (const rule of RULES) {
    if (!rule.kinds.includes(context.kind)) continue
    const match = rule.pattern ? rule.pattern.exec(context.message) ?? undefined : undefined
    if (rule.pattern && !match) continue
    const finding = rule.explain(match, context)
    return { rule: rule.id, cause: finding.cause, steps: finding.steps, confidence: "likely" }
  }
  return undefined
}
