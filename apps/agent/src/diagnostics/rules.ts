import type { CodeLocation, Diagnosis, ProblemKind, SourceLocation } from "./model.ts"

export interface RuleContext {
  readonly kind: ProblemKind
  readonly resource: string | undefined
  readonly location: CodeLocation | undefined
  readonly message: string
  readonly source?: SourceLocation | undefined
  readonly origin?: string | undefined
}

interface Finding {
  readonly cause: string
  readonly steps: ReadonlyArray<string>
}

interface Rule {
  readonly id: string
  readonly kinds: ReadonlyArray<ProblemKind>
  readonly pattern?: RegExp
  readonly applies?: (context: RuleContext) => boolean
  readonly explain: (match: RegExpExecArray | undefined, context: RuleContext) => Finding
}

const place = (context: RuleContext) => {
  if (!context.location) return "that line"
  const target = context.source ?? context.location
  return `${context.location.resource}/${target.file}:${target.line}`
}

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
    id: "js-read-missing",
    kinds: CODE_KINDS,
    pattern: /Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading '([^']+)'\))?/,
    explain: (match, context) => ({
      cause: match?.[2]
        ? `The code at ${place(context)} reads "${match[2]}" from a value that is ${match[1]}`
        : `The code at ${place(context)} reads a property from a value that is ${match?.[1] ?? "undefined"}`,
      steps: [
        `Find where that value comes from before ${place(context)} and handle the case where it is missing`,
        "If it comes from an event argument, a config file or a database row, confirm it is really sent"
      ]
    })
  },
  {
    id: "js-write-missing",
    kinds: CODE_KINDS,
    pattern: /Cannot set propert(?:y|ies) of (undefined|null)(?: \(setting '([^']+)'\))?/,
    explain: (match, context) => ({
      cause: match?.[2]
        ? `The code at ${place(context)} sets "${match[2]}" on a value that is ${match[1]}`
        : `The code at ${place(context)} sets a property on a value that is ${match?.[1] ?? "undefined"}`,
      steps: ["Create the object before writing to it", "Check why it is missing at that point"]
    })
  },
  {
    id: "js-not-a-function",
    kinds: CODE_KINDS,
    pattern: /(\S+) is not a function/,
    explain: (match, context) => ({
      cause: `${match?.[1] ?? "A value"} is not a function when ${place(context)} calls it`,
      steps: [
        "Check the name and that it is imported or exported correctly",
        `If it is an export from another resource, make sure that resource starts before ${owner(context)}`
      ]
    })
  },
  {
    id: "js-not-defined",
    kinds: CODE_KINDS,
    pattern: /(\S+) is not defined/,
    explain: (match, context) => ({
      cause: `${match?.[1] ?? "A name"} does not exist where ${place(context)} uses it`,
      steps: [
        "Check for a typo or a missing import",
        "If it is a FiveM native, check that this file runs on the side where that native exists"
      ]
    })
  },
  {
    id: "js-module-missing",
    kinds: CODE_KINDS,
    pattern: /Cannot find module '([^']+)'/,
    explain: (match, context) => ({
      cause: `The module ${match?.[1] ?? ""} could not be loaded`.replace("  ", " "),
      steps: [
        `Install the dependencies and rebuild ${owner(context)}`,
        "If it is a local file, check the path and that the build output includes it"
      ]
    })
  },
  {
    id: "js-not-iterable",
    kinds: CODE_KINDS,
    pattern: /(\S+) is not iterable/,
    explain: (match, context) => ({
      cause: `${match?.[1] ?? "A value"} is not a list where ${place(context)} loops over it`,
      steps: ["Check what the value really is at that point", "Give it an empty list as a default"]
    })
  },
  {
    id: "js-invalid-json",
    kinds: CODE_KINDS,
    pattern: /is not valid JSON|in JSON at position|Unexpected end of JSON input/,
    explain: (_match, context) => ({
      cause: `The code at ${place(context)} parses text that is not valid JSON`,
      steps: ["Check the file or the message being parsed", "Wrap the parse in a try and handle bad input"]
    })
  },
  {
    id: "js-stack-overflow",
    kinds: CODE_KINDS,
    pattern: /Maximum call stack size exceeded/,
    explain: (_match, context) => ({
      cause: `A function keeps calling itself until the stack runs out, around ${place(context)}`,
      steps: ["Look for recursion without a stop condition", "Check for two event handlers that trigger each other"]
    })
  },
  {
    id: "js-syntax",
    kinds: CODE_KINDS,
    pattern: /SyntaxError: /,
    explain: (_match, context) => ({
      cause: `The script has a syntax error at ${place(context)}, so it never loaded`,
      steps: ["Fix the syntax or rebuild the bundle", `Run ensure ${owner(context)} again after saving`]
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
    id: "js-unhandled-rejection",
    kinds: CODE_KINDS,
    applies: (context) => context.origin?.startsWith("promise") ?? false,
    explain: (_match, context) => ({
      cause: `A promise failed at ${place(context)} and nothing handled the failure`,
      steps: ["Add a try and catch around the await, or a catch on the promise", "Log the failure so the next one explains itself"]
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
    if (rule.applies && !rule.applies(context)) continue
    const match = rule.pattern ? rule.pattern.exec(context.message) ?? undefined : undefined
    if (rule.pattern && !match) continue
    const finding = rule.explain(match, context)
    return { rule: rule.id, cause: finding.cause, steps: finding.steps, confidence: "likely" }
  }
  return undefined
}
