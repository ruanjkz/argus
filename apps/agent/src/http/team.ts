import { atLeast, ROLES, toPublic, type AccountStore, type Role } from "../accounts.ts"
import { readArgusFile, writeArgusFile } from "../home.ts"
import { clearedCookie, HttpError, lanAddresses, readBody, send, sessionCookie, type Handler, type HttpHost, type RequestContext } from "./host.ts"

const text = (value: unknown) => (typeof value === "string" ? value : "")

const roleOf = (value: unknown): Role => {
  if (typeof value === "string" && (ROLES as ReadonlyArray<string>).includes(value)) return value as Role
  throw new HttpError(400, "Pick a role: admin or moderator")
}

const require = (context: RequestContext, role: Role) => {
  if (!context.account) throw new HttpError(401, "Sign in first")
  if (!atLeast(context.account, role)) throw new HttpError(403, `Only ${role === "owner" ? "the owner" : `${role}s`} can do this`)
  return context.account
}

export const makeTeamHandler = (accounts: AccountStore, host: HttpHost, home: string): Handler => async (request, response, route, context) => {
  switch (route) {
    case "GET /session": {
      const account = context.account
      send(response, 200, {
        account: account ? toPublic(account) : null,
        needsOwner: !accounts.hasOwner,
        canCreateOwner: !accounts.hasOwner && context.local,
        remote: host.remote
      })
      return true
    }
    case "POST /session": {
      const body = await readBody(request)
      const { account, token } = accounts.login(text(body.username).trim(), text(body.password), context.address)
      response.setHeader("set-cookie", sessionCookie(token, context.secure))
      send(response, 200, { account: toPublic(account) })
      return true
    }
    case "POST /session/logout":
      accounts.logout(context.token)
      response.setHeader("set-cookie", clearedCookie())
      send(response, 200, { ok: true })
      return true
    case "POST /session/password": {
      if (!context.account) throw new HttpError(401, "Sign in first")
      const body = await readBody(request)
      accounts.changePassword(context.account, text(body.current), text(body.next), context.token)
      send(response, 200, { account: toPublic(context.account) })
      return true
    }
    case "POST /accounts/owner": {
      if (accounts.hasOwner) throw new HttpError(409, "There is already an owner")
      if (!context.local) throw new HttpError(403, "Create the owner account on the machine that runs Argus")
      const body = await readBody(request)
      const owner = accounts.createOwner(text(body.username), text(body.password))
      response.setHeader("set-cookie", sessionCookie(accounts.startSession(owner), context.secure))
      send(response, 200, { account: toPublic(owner) })
      return true
    }
    case "GET /accounts":
      require(context, "admin")
      send(response, 200, accounts.list())
      return true
    case "POST /accounts": {
      const actor = require(context, "admin")
      const body = await readBody(request)
      send(response, 200, accounts.createMember(actor, text(body.username), roleOf(body.role)))
      return true
    }
    case "POST /accounts/reset": {
      const actor = require(context, "admin")
      const body = await readBody(request)
      send(response, 200, accounts.resetPassword(actor, text(body.id)))
      return true
    }
    case "PUT /accounts": {
      const actor = require(context, "admin")
      const body = await readBody(request)
      send(
        response,
        200,
        accounts.update(actor, text(body.id), {
          ...(body.role === undefined ? {} : { role: roleOf(body.role) }),
          ...(typeof body.disabled === "boolean" ? { disabled: body.disabled } : {})
        })
      )
      return true
    }
    case "POST /accounts/remove": {
      const actor = require(context, "admin")
      const body = await readBody(request)
      accounts.remove(actor, text(body.id))
      send(response, 200, { ok: true })
      return true
    }
    case "GET /remote":
      require(context, "admin")
      send(response, 200, { enabled: host.remote, port: host.port, addresses: lanAddresses() })
      return true
    case "PUT /remote": {
      require(context, "owner")
      const body = await readBody(request)
      if (typeof body.enabled !== "boolean") throw new HttpError(400, "Send enabled: true or false")
      const file = readArgusFile(home)
      if (!file) throw new HttpError(500, "Argus is not set up")
      writeArgusFile({ ...file, remote: body.enabled }, home)
      const enabled = body.enabled
      response.on("finish", () => {
        host.setRemote(enabled).catch((error: unknown) => {
          writeArgusFile({ ...file, remote: !enabled }, home)
          console.log(`[argus] could not switch remote access: ${error instanceof Error ? error.message : String(error)}`)
        })
      })
      send(response, 200, { enabled, port: host.port, addresses: lanAddresses() })
      return true
    }
    default:
      return false
  }
}
