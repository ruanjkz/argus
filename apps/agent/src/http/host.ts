import { timingSafeEqual } from "node:crypto"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { extname } from "node:path"

import { Effect } from "effect"

import { panelFile } from "../assets.ts"

const MAX_BODY_BYTES = 64 * 1024

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

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export type Handler = (request: IncomingMessage, response: ServerResponse, route: string) => Promise<boolean>

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

const hasToken = (request: IncomingMessage, token: string | undefined) => {
  if (!token) return false
  const header = request.headers.authorization ?? ""
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "")
  const expected = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const localHosts = (port: number) => new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`])

const browserAllowed = (request: IncomingMessage, port: number, devOrigin: string | undefined) => {
  const hosts = localHosts(port)
  if (!hosts.has(request.headers.host ?? "")) return false
  const origin = request.headers.origin
  if (origin !== undefined && origin !== devOrigin) {
    try {
      if (!hosts.has(new URL(origin).host)) return false
    } catch {
      return false
    }
  }
  if (request.method !== "GET" && request.headers["x-argus"] !== "1") return false
  return request.headers["sec-fetch-site"] !== "cross-site" || origin === devOrigin
}

const serveStatic = (request: IncomingMessage, response: ServerResponse, pathname: string) => {
  if (request.method !== "GET" && request.method !== "HEAD") return false
  const clean = decodeURIComponent(pathname).replace(/^\/+/, "").replace(/\/+$/, "")
  if (clean.includes("..")) return false
  const candidates = clean === "" ? ["index.html"] : [clean, `${clean}.html`, `${clean}/index.html`]
  for (const candidate of candidates) {
    const data = panelFile(candidate)
    if (!data) continue
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(candidate)] ?? "application/octet-stream",
      "cache-control": candidate.startsWith("_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY"
    })
    response.end(request.method === "HEAD" ? undefined : data)
    return true
  }
  const missing = panelFile("404.html")
  response.writeHead(404, { "content-type": "text/html; charset=utf-8" })
  response.end(missing ?? "Not found")
  return true
}

export interface HttpHost {
  readonly port: number
  use(handler: Handler, token?: string): void
}

export const startHost = (port: number) =>
  Effect.gen(function*() {
    let handler: Handler | undefined
    let token: string | undefined
    const devOrigin = process.env.ARGUS_DEV_ORIGIN

    const handle = async (request: IncomingMessage, response: ServerResponse) => {
      const url = new URL(request.url ?? "/", "http://localhost")
      if (!url.pathname.startsWith("/api/")) {
        if (!localHosts(port).has(request.headers.host ?? "")) throw new HttpError(421, "Open Argus at http://localhost")
        serveStatic(request, response, url.pathname)
        return
      }
      if (devOrigin && request.headers.origin === devOrigin) {
        response.setHeader("access-control-allow-origin", devOrigin)
        response.setHeader("access-control-allow-headers", "content-type, x-argus")
        response.setHeader("access-control-allow-methods", "GET, POST, PUT")
        if (request.method === "OPTIONS") {
          response.writeHead(204)
          response.end()
          return
        }
      }
      if (url.pathname === "/api/health") return send(response, 200, { ok: true })
      if (!hasToken(request, token) && !browserAllowed(request, port, devOrigin)) throw new HttpError(403, "Request refused")
      const route = `${request.method ?? "GET"} ${url.pathname.slice(4)}`
      const handled = handler ? await handler(request, response, route) : false
      if (!handled) throw new HttpError(404, "Not found")
    }

    const server = createServer((request, response) => {
      handle(request, response).catch((error: unknown) => {
        if (response.headersSent) return response.end()
        if (error instanceof HttpError) return send(response, error.status, { error: error.message })
        return send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" })
      })
    })

    yield* Effect.acquireRelease(
      Effect.callback<void, Error>((resume) => {
        server.once("error", (error) => resume(Effect.fail(error)))
        server.listen(port, "127.0.0.1", () => resume(Effect.void))
      }),
      () =>
        Effect.callback<void>((resume) => {
          server.closeAllConnections()
          server.close(() => resume(Effect.void))
        })
    )

    const host: HttpHost = {
      port,
      use: (next, nextToken) => {
        handler = next
        token = nextToken
      }
    }
    return host
  })
