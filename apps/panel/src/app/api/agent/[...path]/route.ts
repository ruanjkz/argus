import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import type { NextRequest } from "next/server"

const ALLOWED = new Set([
  "GET state",
  "GET events",
  "GET problems",
  "GET settings",
  "PUT settings",
  "GET git",
  "PUT git",
  "POST git/key",
  "POST git/test",
  "POST command",
  "POST server/start",
  "POST server/stop",
  "POST server/restart",
])

type AgentFile = { token: string; agentPort: number }

async function agentFile(): Promise<AgentFile | null> {
  const home = process.env.ARGUS_HOME ?? join(homedir(), ".argus")
  try {
    const parsed: unknown = JSON.parse(await readFile(join(home, "argus.json"), "utf8"))
    if (typeof parsed !== "object" || parsed === null) return null
    const { token, agentPort } = parsed as Record<string, unknown>
    if (typeof token !== "string") return null
    return { token, agentPort: typeof agentPort === "number" ? agentPort : 3201 }
  } catch {
    return null
  }
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin === null) return request.headers.get("sec-fetch-site") !== "cross-site"
  try {
    return new URL(origin).host === request.headers.get("host")
  } catch {
    return false
  }
}

function reply(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } })
}

async function forward(request: NextRequest, context: RouteContext<"/api/agent/[...path]">) {
  const { path } = await context.params
  const route = path.join("/")
  if (!ALLOWED.has(`${request.method} ${route}`)) return reply(404, "Not found")
  if (!sameOrigin(request)) return reply(403, "Cross-site requests are not allowed")
  if (request.method !== "GET" && request.headers.get("x-argus") !== "1") return reply(403, "Missing x-argus header")

  const file = await agentFile()
  if (!file) return reply(503, "Argus is not set up on this machine. Run argus init.")

  try {
    const upstream = await fetch(`http://127.0.0.1:${file.agentPort}/api/${route}`, {
      method: request.method,
      headers: { authorization: `Bearer ${file.token}`, "content-type": "application/json" },
      body: request.method === "GET" ? undefined : await request.text(),
      signal: request.signal,
      cache: "no-store",
    })
    const headers = new Headers({ "cache-control": "no-store" })
    headers.set("content-type", upstream.headers.get("content-type") ?? "application/json")
    if (route === "events") headers.set("x-accel-buffering", "no")
    return new Response(upstream.body, { status: upstream.status, headers })
  } catch {
    return reply(503, "The Argus agent is not running. Start it with argus start.")
  }
}

export const GET = forward
export const PUT = forward
export const POST = forward
