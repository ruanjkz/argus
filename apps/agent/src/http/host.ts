import { timingSafeEqual } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { networkInterfaces } from "node:os"
import { extname } from "node:path"

import { Effect } from "effect"

import { AccountError, type Account, type AccountStore } from "../accounts.ts"
import { panelFile } from "../assets.ts"

const MAX_BODY_BYTES = 64 * 1024
export const SESSION_COOKIE = "argus_session"

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json"
}

const PUBLIC_ROUTES = new Set(["GET /session", "POST /session", "POST /session/logout", "POST /accounts/owner"])
const SETUP_ROUTES = new Set(["GET /setup", "POST /setup/check", "POST /setup/install", "GET /state"])
const PASSWORD_ROUTES = new Set(["POST /session/password"])

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export interface RequestContext {
  readonly account: Account | undefined
  readonly token: string | undefined
  readonly local: boolean
  readonly address: string
  readonly secure: boolean
}

export type Handler = (request: IncomingMessage, response: ServerResponse, route: string, context: RequestContext) => Promise<boolean>

export const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  response.end(JSON.stringify(body))
}

export const readBody = (request: IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const chunks: Array<Buffer> = []
    let size = 0
    request.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Body too large"))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on("end", () => {
      if (size === 0) return resolve({})
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object")
        resolve(parsed as Record<string, unknown>)
      } catch {
        reject(new HttpError(400, "Body must be a JSON object"))
      }
    })
    request.on("error", reject)
  })

export const sessionCookie = (token: string, secure: boolean) =>
  `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}${secure ? "; Secure" : ""}`

export const clearedCookie = () => `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`

const readCookie = (request: IncomingMessage, name: string) => {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=")
    if (key === name) return value.join("=")
  }
  return undefined
}

const hasToken = (request: IncomingMessage, token: string | undefined) => {
  if (!token) return false
  const header = request.headers.authorization ?? ""
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "")
  const expected = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

export const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry !== undefined && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry!.address)

const serveStatic = (request: IncomingMessage, response: ServerResponse, pathname: string) => {
  if (request.method !== "GET" && request.method !== "HEAD") return false
  const clean = decodeURIComponent(pathname).replace(/^\/+/, "").replace(/\/+$/, "")
  if (clean.includes("..")) return false
  const candidates = clean === "" ? ["index.html"] : [clean, `${clean}.html`, `${clean}/index.html`]
  const headers = { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer" }
  for (const candidate of candidates) {
    const data = panelFile(candidate)
    if (!data) continue
    response.writeHead(200, {
      ...headers,
      "content-type": CONTENT_TYPES[extname(candidate)] ?? "application/octet-stream",
      "cache-control": candidate.startsWith("_next/static/") ? "public, max-age=31536000, immutable" : "no-cache"
    })
    response.end(request.method === "HEAD" ? undefined : data)
    return true
  }
  response.writeHead(404, { ...headers, "content-type": "text/html; charset=utf-8" })
  response.end(panelFile("404.html") ?? "Not found")
  return true
}

export interface HostOptions {
  readonly port: number
  readonly remote: boolean
  readonly accounts: AccountStore
}

export interface HttpHost {
  readonly port: number
  readonly remote: boolean
  use(handler: Handler, token?: string, setup?: boolean): void
  setRemote(remote: boolean): Promise<void>
}

export const startHost = (options: HostOptions) =>
  Effect.gen(function*() {
    const { port, accounts } = options
    let remote = options.remote
    let handler: Handler | undefined
    let token: string | undefined
    let setupMode = false
    const devOrigin = process.env.ARGUS_DEV_ORIGIN
    const localHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`])

    const sameOrigin = (request: IncomingMessage) => {
      const origin = request.headers.origin
      if (origin === undefined) return request.headers["sec-fetch-site"] !== "cross-site"
      if (origin === devOrigin) return true
      try {
        return new URL(origin).host === request.headers.host
      } catch {
        return false
      }
    }

    const handle = async (request: IncomingMessage, response: ServerResponse) => {
      const url = new URL(request.url ?? "/", "http://localhost")
      const address = request.socket.remoteAddress ?? ""
      const local = LOOPBACK.has(address)
      const knownHost = localHosts.has(request.headers.host ?? "")
      if (!remote && !knownHost) throw new HttpError(421, "Open Argus at http://localhost")
      if (!url.pathname.startsWith("/api/")) {
        serveStatic(request, response, url.pathname)
        return
      }
      if (devOrigin && request.headers.origin === devOrigin) {
        response.setHeader("access-control-allow-origin", devOrigin)
        response.setHeader("access-control-allow-credentials", "true")
        response.setHeader("access-control-allow-headers", "content-type, x-argus")
        response.setHeader("access-control-allow-methods", "GET, POST, PUT")
        if (request.method === "OPTIONS") {
          response.writeHead(204)
          response.end()
          return
        }
      }
      if (url.pathname === "/api/health") return send(response, 200, { ok: true })

      const route = `${request.method ?? "GET"} ${url.pathname.slice(4)}`
      const scripted = hasToken(request, token) && local
      if (!scripted) {
        if (!sameOrigin(request)) throw new HttpError(403, "Cross-site requests are not allowed")
        if (request.method !== "GET" && request.headers["x-argus"] !== "1") throw new HttpError(403, "Missing x-argus header")
      }

      const sessionToken = readCookie(request, SESSION_COOKIE)
      const account = accounts.fromToken(sessionToken)
      const context: RequestContext = { account, token: sessionToken, local, address, secure: request.headers["x-forwarded-proto"] === "https" }

      if (setupMode) {
        if (!SETUP_ROUTES.has(route)) throw new HttpError(409, "Argus is not set up yet")
        if (!local) throw new HttpError(403, "Finish the setup on the machine that runs Argus")
      } else if (!scripted && !PUBLIC_ROUTES.has(route)) {
        if (!account) throw new HttpError(401, "Sign in first")
        if (account.mustChangePassword && !PASSWORD_ROUTES.has(route)) throw new HttpError(428, "Change your password first")
      }

      const handled = handler ? await handler(request, response, route, context) : false
      if (!handled) throw new HttpError(404, "Not found")
    }

    const listener = (request: IncomingMessage, response: ServerResponse) => {
      handle(request, response).catch((error: unknown) => {
        if (response.headersSent) return response.end()
        if (error instanceof HttpError || error instanceof AccountError) return send(response, error.status, { error: error.message })
        return send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" })
      })
    }

    let server: Server = createServer(listener)

    const listen = (target: Server, bindRemote: boolean) =>
      new Promise<void>((resolve, reject) => {
        target.once("error", reject)
        target.listen(port, bindRemote ? "0.0.0.0" : "127.0.0.1", () => {
          target.off("error", reject)
          resolve()
        })
      })

    const close = (target: Server) =>
      new Promise<void>((resolve) => {
        target.closeAllConnections()
        target.close(() => resolve())
      })

    yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => listen(server, remote), catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))) }),
      () => Effect.promise(() => close(server))
    )

    const host: HttpHost = {
      port,
      get remote() {
        return remote
      },
      use: (next, nextToken, setup = false) => {
        handler = next
        token = nextToken
        setupMode = setup
      },
      setRemote: async (next) => {
        if (next === remote) return
        await close(server)
        server = createServer(listener)
        try {
          await listen(server, next)
          remote = next
        } catch (error) {
          server = createServer(listener)
          await listen(server, remote)
          throw error
        }
      }
    }
    return host
  })
