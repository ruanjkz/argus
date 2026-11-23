import { Context, Duration, Layer } from "effect"

export interface ServerSettings {
  readonly executable: string
  readonly args: ReadonlyArray<string>
  readonly cwd?: string | undefined
  readonly env?: Readonly<Record<string, string>> | undefined
  readonly heartbeatResource: string
  readonly bootTimeout: Duration.Duration
  readonly heartbeatTimeout: Duration.Duration
  readonly watchdogInterval: Duration.Duration
  readonly stopTimeout: Duration.Duration
  readonly stableAfter: Duration.Duration
  readonly restartBaseDelay: Duration.Duration
  readonly restartMaxDelay: Duration.Duration
  readonly portRetryStep: Duration.Duration
  readonly portRetryMaxDelay: Duration.Duration
  readonly maxConsecutiveFailures: number
  readonly historySize: number
}

export const defaultSettings = {
  args: [],
  heartbeatResource: "argus",
  bootTimeout: Duration.minutes(2),
  heartbeatTimeout: Duration.seconds(60),
  watchdogInterval: Duration.seconds(1),
  stopTimeout: Duration.seconds(15),
  stableAfter: Duration.minutes(5),
  restartBaseDelay: Duration.seconds(2),
  restartMaxDelay: Duration.seconds(60),
  portRetryStep: Duration.seconds(5),
  portRetryMaxDelay: Duration.seconds(45),
  maxConsecutiveFailures: 5,
  historySize: 2000
} satisfies Omit<ServerSettings, "executable">

export class ServerConfig extends Context.Service<ServerConfig, ServerSettings>()("argus/agent/ServerConfig") {
  static readonly layer = (settings: Partial<ServerSettings> & Pick<ServerSettings, "executable">) =>
    Layer.succeed(ServerConfig, ServerConfig.of({ ...defaultSettings, ...settings }))
}
