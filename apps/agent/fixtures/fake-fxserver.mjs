import net from "node:net"
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

const hitch = (milliseconds) =>
  print("citizen-server-impl", `server thread hitch warning: timer interval of ${milliseconds} milliseconds`)

const hang = () => {
  trace({ type: "watchdog_bark", thread: "svMain", stack: "@inventory/server/tick.lua:212\n@inventory/server/main.lua:48" })
  setTimeout(() => hitch(4100), 150)
}

let heartbeat = null
const startHeartbeat = () => {
  const beat = () => trace({ type: "script_structured_trace", resource, payload: { type: "heartbeat", players } })
  beat()
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
  if (command === "fake-error") {
    scriptError()
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
