import { existsSync, readdirSync, statSync } from "node:fs"
import net from "node:net"
import { join } from "node:path"
import readline from "node:readline"

const scenario = process.env.FAKE_SCENARIO ?? "normal"
const heartbeatMs = Number(process.env.FAKE_HEARTBEAT_MS ?? 3000)
const bootMs = Number(process.env.FAKE_BOOT_MS ?? 1200)
const failAfterMs = Number(process.env.FAKE_FAIL_AFTER_MS ?? 1500)
const resource = process.env.FAKE_RESOURCE ?? "argus"
const players = Number(process.env.FAKE_PLAYERS ?? 48)

const channel = (name) => `\u001b[97m[${name.padStart(19)}]\u001b[0m`
const print = (name, text) => process.stdout.write(`${channel(name)} ${text}\n`)

let traces = null
try {
  traces = new net.Socket({ fd: 3, readable: false, writable: true })
  traces.on("error", () => {
    traces = null
  })
} catch {
  traces = null
}

const trace = (data) => traces?.write(JSON.stringify({ channel: "citizen-server-impl", data }))

const scriptError = () => {
  print("script:shop", "SCRIPT ERROR: @shop/server/main.lua:88: attempt to index a nil value (field 'price')")
  print("script:shop", "> handler (@shop/server/main.lua:88)")
}

const javascriptError = () => {
  print("script:market", "\u001b[31mSCRIPT ERROR in event `market:buy': TypeError: Cannot read properties of undefined (reading 'amount')\u001b[0m")
  print("script:market", "> priceOf (@market/dist/server.js:7)")
  print("script:market", "> <anonymous> (@market/dist/server.js:10)")
}

const hitch = (milliseconds) =>
  print("citizen-server-impl", `server thread hitch warning: timer interval of ${milliseconds} milliseconds`)

const hang = () => {
  trace({ type: "watchdog_bark", thread: "svMain", stack: "@inventory/server/tick.lua:212\n@inventory/server/main.lua:48" })
  setTimeout(() => hitch(4100), 150)
}

const NAMES = ["kxng", "vlt.ana", "mrkz", "dusk", "neblina", "tornado7", "lia", "zeca", "r4ven", "bruxo", "kaio_", "sereia"]
const roster = Array.from({ length: players }, (_, index) => ({
  id: 3 + index * 7,
  name: index < NAMES.length ? NAMES[index] : `${NAMES[index % NAMES.length]}${Math.floor(index / NAMES.length)}`,
  ping: 20 + ((index * 17) % 60),
  identifiers: [
    `license:${(index + 1).toString(16).padStart(40, "a")}`,
    `discord:${100000000000000000n + BigInt(index)}`,
    `ip:198.51.100.${10 + (index % 3)}`
  ],
  tokens: [`4:fake${index}`]
}))
let online = [...roster]

const resourceStates = new Map()
const scanResources = (root) => {
  if (!root || !existsSync(root)) return
  const walk = (folder, depth) => {
    for (const entry of readdirSync(folder)) {
      const full = join(folder, entry)
      if (!statSync(full).isDirectory()) continue
      if (/^\[.*\]$/.test(entry)) {
        if (depth < 4) walk(full, depth + 1)
      } else if (existsSync(join(full, "fxmanifest.lua")) || existsSync(join(full, "__resource.lua"))) {
        resourceStates.set(entry, "started")
      }
    }
  }
  walk(root, 0)
}
scanResources(process.env.FAKE_RESOURCE_ROOT)
resourceStates.set(resource, "started")

const sendPlayers = () => trace({ type: "script_structured_trace", resource, payload: { type: "players", list: online } })
const sendResources = () =>
  trace({ type: "script_structured_trace", resource, payload: { type: "resources", list: [...resourceStates].map(([name, state]) => ({ name, state })) } })

let heartbeat = null
const startHeartbeat = () => {
  const beat = () => {
    trace({ type: "script_structured_trace", resource, payload: { type: "heartbeat", players: online.length } })
    sendPlayers()
  }
  beat()
  sendResources()
  heartbeat = setInterval(beat, heartbeatMs)
}
const stopHeartbeat = () => {
  if (heartbeat) clearInterval(heartbeat)
  heartbeat = null
}

const exit = (code) => {
  stopHeartbeat()
  traces?.end()
  setTimeout(() => process.exit(code), 50)
}

print("citizen-server-main", "Argus fake FXServer, build 19253")
print("resources", "Scanning resources.")
print("resources", "Found 24 resources.")
print("citizen-server-impl", "Running in OneSync mode")

setTimeout(() => {
  if (scenario === "bind-error") {
    process.stderr.write("Could not bind on 0.0.0.0:30120 - is this address valid and not already in use?\n")
    trace({ type: "bind_error", address: "0.0.0.0:30120" })
    return
  }
  if (scenario === "no-heartbeat") return

  print("citizen-server-impl", "Server license key authentication succeeded. Welcome!")
  print(`script:${resource}`, "Argus monitor started")
  trace({ type: "nucleus_connected", url: "https://fake-abc123.users.cfx.re/" })
  startHeartbeat()

  if (scenario === "crash") {
    setTimeout(() => {
      process.stderr.write("Unhandled exception in citizen-scripting-lua\n")
      exit(1)
    }, failAfterMs)
  }
  if (scenario === "hang") {
    setTimeout(() => {
      stopHeartbeat()
      trace({ type: "watchdog_bark", thread: "svMain", stack: "@shop/server/main.lua:88" })
    }, failAfterMs)
  }
  if (scenario === "noisy") {
    setTimeout(() => {
      scriptError()
      scriptError()
      scriptError()
      javascriptError()
      javascriptError()
      hitch(180)
      hang()
    }, failAfterMs)
  }
}, bootMs)

const input = readline.createInterface({ input: process.stdin })
input.on("line", (line) => {
  const command = line.trim()
  if (/^quit(\s|$)/i.test(command)) {
    if (scenario === "ignore-quit") {
      print("citizen-server-impl", "Ignoring quit")
      return
    }
    print("citizen-server-impl", "Quitting")
    exit(0)
    return
  }
  if (command.startsWith("echo ")) {
    print("cmd", command.slice(5))
    return
  }
  if (command === "status") {
    print("cmd", `${players} players online`)
    return
  }
  const [name, ...args] = command.split(/\s+/)
  if (name === "argus_kick") {
    const id = Number(args[0])
    const player = online.find((entry) => entry.id === id)
    if (player) {
      online = online.filter((entry) => entry !== player)
      print("citizen-server-impl", `Dropped ${player.name}: ${args.slice(1).join(" ")}`)
      sendPlayers()
    }
    return
  }
  if (name === "argus_warn") {
    print("chat", `to ${args[0]}: ${args.slice(1).join(" ")}`)
    return
  }
  if (name === "argus_reload_bans") {
    print(`script:${resource}`, "Ban list reloaded")
    return
  }
  if ((name === "ensure" || name === "start" || name === "restart") && args[0]) {
    resourceStates.set(args[0], "started")
    print("resources", `Started resource ${args[0]}`)
    sendResources()
    return
  }
  if (name === "stop" && args[0]) {
    resourceStates.set(args[0], "stopped")
    print("resources", `Stopping resource ${args[0]}`)
    sendResources()
    return
  }
  if (command === "fake-error") {
    scriptError()
    return
  }
  if (command === "fake-js-error") {
    javascriptError()
    return
  }
  if (command.startsWith("fake-hitch")) {
    hitch(Number(command.split(/\s+/)[1] ?? 180))
    return
  }
  if (command === "fake-hang") {
    hang()
    return
  }
  print("cmd", `No such command ${command}.`)
})
