import { Effect, Option, Queue, Stream } from "effect"
import type { PlatformError } from "effect/PlatformError"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import type { Scope } from "effect/Scope"

import type { ServerSettings } from "./config.ts"
import type { LineSource } from "./domain.ts"
import { decodeTrace, splitJsonValues, type Trace } from "./fd3.ts"

export interface OutputLine {
  readonly source: Extract<LineSource, "stdout" | "stderr">
  readonly text: string
}

export interface FxProcess {
  readonly pid: number
  readonly output: Stream.Stream<OutputLine, PlatformError>
  readonly traces: Stream.Stream<Trace, PlatformError>
  readonly exitCode: Effect.Effect<number, PlatformError>
  send(command: string): Effect.Effect<void>
}

const encoder = new TextEncoder()

const toLines = (stream: Stream.Stream<Uint8Array, PlatformError>, source: OutputLine["source"]) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.map((text): OutputLine => ({ source, text }))
  )

export const spawnFxServer = Effect.fnUntraced(function*(
  settings: ServerSettings
): Effect.fn.Return<FxProcess, PlatformError, ChildProcessSpawner.ChildProcessSpawner | Scope> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const commands = yield* Queue.unbounded<string>()

  const handle = yield* spawner.spawn(
    ChildProcess.make(settings.executable, [...settings.args], {
      cwd: settings.cwd,
      env: settings.env,
      extendEnv: true,
      stdin: {
        stream: Stream.fromQueue(commands).pipe(Stream.map((command) => encoder.encode(`${command}\n`))),
        endOnDone: true
      },
      additionalFds: { fd3: { type: "output" } }
    })
  )

  const traces = handle.getOutputFd(3).pipe(
    Stream.decodeText(),
    Stream.mapAccum(() => "", splitJsonValues),
    Stream.map((text) => decodeTrace(text)),
    Stream.filter(Option.isSome),
    Stream.map((trace) => trace.value)
  )

  return {
    pid: handle.pid,
    output: Stream.merge(toLines(handle.stdout, "stdout"), toLines(handle.stderr, "stderr")),
    traces,
    exitCode: Effect.map(handle.exitCode, (code) => Number(code)),
    send: (command) => Queue.offer(commands, command).pipe(Effect.asVoid)
  }
})
