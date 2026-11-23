import { Duration } from "effect"

import type { ServerSettings } from "./config.ts"
import type { IncidentKind } from "./domain.ts"
import type { SessionFailure } from "./errors.ts"

type DelaySettings = Pick<ServerSettings, "restartBaseDelay" | "restartMaxDelay" | "portRetryStep" | "portRetryMaxDelay">

export const isRetryable = (failure: SessionFailure): boolean => failure._tag !== "SpawnFailed"

export const restartDelay = (failure: SessionFailure, attempt: number, settings: DelaySettings): Duration.Duration => {
  const step = Math.max(1, attempt)
  if (failure._tag === "PortInUse") {
    return Duration.min(Duration.times(settings.portRetryStep, step), settings.portRetryMaxDelay)
  }
  return Duration.min(Duration.times(settings.restartBaseDelay, 2 ** (step - 1)), settings.restartMaxDelay)
}

export const describeFailure = (failure: SessionFailure): { readonly kind: IncidentKind; readonly message: string } => {
  switch (failure._tag) {
    case "SpawnFailed":
      return { kind: "spawn-failed", message: `Could not start FXServer: ${failure.message}` }
    case "Crashed":
      return { kind: "crashed", message: `FXServer exited with code ${failure.exitCode}` }
    case "PortInUse":
      return { kind: "port-in-use", message: `Port ${failure.address} is already in use` }
    case "BootTimeout":
      return { kind: "boot-timeout", message: `No heartbeat ${Math.round(failure.waitedMs / 1000)}s after start` }
    case "HeartbeatLost":
      return { kind: "heartbeat-lost", message: `No heartbeat for ${Math.round(failure.silentForMs / 1000)}s` }
  }
}
