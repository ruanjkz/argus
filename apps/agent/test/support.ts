import { fileURLToPath } from "node:url"

import { NodeServices } from "@effect/platform-node"
import { Duration, Layer } from "effect"

import { ServerConfig, type ServerSettings } from "../src/config.ts"
import { Diagnostics } from "../src/diagnostics/service.ts"
import { Supervisor } from "../src/supervisor.ts"

const fakeServer = fileURLToPath(new URL("../fixtures/fake-fxserver.mjs", import.meta.url))

const configLayer = (scenario: string, overrides: Partial<ServerSettings>) =>
  ServerConfig.layer({
    executable: process.execPath,
    args: [fakeServer],
    env: { FAKE_SCENARIO: scenario, FAKE_HEARTBEAT_MS: "100", FAKE_BOOT_MS: "150", FAKE_FAIL_AFTER_MS: "400" },
    bootTimeout: Duration.seconds(5),
    heartbeatTimeout: Duration.millis(700),
    watchdogInterval: Duration.millis(100),
    stopTimeout: Duration.seconds(2),
    restartBaseDelay: Duration.millis(50),
    restartMaxDelay: Duration.millis(200),
    portRetryStep: Duration.millis(50),
    portRetryMaxDelay: Duration.millis(200),
    ...overrides
  })

export const supervisorLayer = (scenario: string, overrides: Partial<ServerSettings> = {}) =>
  Supervisor.layer.pipe(Layer.provide(configLayer(scenario, overrides)), Layer.provide(NodeServices.layer))

export const diagnosticsLayer = (scenario: string, overrides: Partial<ServerSettings> = {}) =>
  Diagnostics.layer.pipe(Layer.provideMerge(supervisorLayer(scenario, overrides)))
