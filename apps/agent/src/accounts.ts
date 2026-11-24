import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type Role = "owner" | "admin" | "moderator"

export const ROLES: ReadonlyArray<Role> = ["owner", "admin", "moderator"]

export const ROLE_RANK: Record<Role, number> = { moderator: 1, admin: 2, owner: 3 }

export interface Account {
  id: string
  username: string
  role: Role
  passwordHash: string
  mustChangePassword: boolean
  disabled: boolean
  createdAt: number
  createdBy: string | null
  lastLoginAt: number | null
}

export type PublicAccount = Omit<Account, "passwordHash">

interface Session {
  tokenHash: string
  accountId: string
  createdAt: number
  expiresAt: number
}

interface AccountsFile {
  version: 1
  accounts: Array<Account>
  sessions: Array<Session>
}

export class AccountError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const SESSION_DAYS = 30
const MIN_PASSWORD = 10
const MAX_PASSWORD = 200
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,23}$/
const FAILURE_LIMIT = 5
const FAILURE_WINDOW_MS = 10 * 60_000
const LOCK_MS = 60_000
const TEMPORARY_WORDS = "abcdefghjkmnpqrstuvwxyz23456789"

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

export const hashPassword = (password: string) => {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`
}

export const verifyPassword = (password: string, stored: string) => {
  const [scheme, salt, hash] = stored.split("$")
  if (scheme !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64")
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: 16384, r: 8, p: 1 })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export const temporaryPassword = () => {
  const bytes = randomBytes(12)
  const characters = Array.from(bytes, (byte) => TEMPORARY_WORDS[byte % TEMPORARY_WORDS.length])
  return [0, 4, 8].map((start) => characters.slice(start, start + 4).join("")).join("-")
}

export const passwordProblem = (password: string, username?: string) => {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`
  if (username && password.toLowerCase().includes(username.toLowerCase())) return "Do not put your username in the password."
  return null
}

export const usernameProblem = (username: string) =>
  USERNAME_PATTERN.test(username) ? null : "Use 2 to 24 lowercase letters, numbers, dots, dashes or underscores."

export const toPublic = ({ passwordHash: _hidden, ...account }: Account): PublicAccount => account

export class AccountStore {
  private data: AccountsFile
  private readonly failures = new Map<string, { count: number; first: number; lockedUntil: number }>()
  private readonly dummyHash = hashPassword(randomBytes(8).toString("hex"))

  constructor(private readonly home: string) {
    this.data = this.read()
  }

  private get file() {
    return join(this.home, "accounts.json")
  }

  private read(): AccountsFile {
    if (!existsSync(this.file)) return { version: 1, accounts: [], sessions: [] }
    const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<AccountsFile>
    return { version: 1, accounts: parsed.accounts ?? [], sessions: parsed.sessions ?? [] }
  }

  private save() {
    mkdirSync(this.home, { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, this.file)
  }

  get hasOwner() {
    return this.data.accounts.some((account) => account.role === "owner" && !account.disabled)
  }

  list() {
    return this.data.accounts.map(toPublic)
  }

  find(id: string) {
    return this.data.accounts.find((account) => account.id === id)
  }

  private byName(username: string) {
    return this.data.accounts.find((account) => account.username === username.toLowerCase())
  }

  private add(username: string, role: Role, password: string, mustChangePassword: boolean, createdBy: string | null) {
    const name = username.trim().toLowerCase()
    const problem = usernameProblem(name)
    if (problem) throw new AccountError(400, problem)
    if (this.byName(name)) throw new AccountError(409, `${name} already has an account.`)
    const account: Account = {
      id: randomUUID(),
      username: name,
      role,
      passwordHash: hashPassword(password),
      mustChangePassword,
      disabled: false,
      createdAt: Date.now(),
      createdBy,
      lastLoginAt: null
    }
    this.data.accounts.push(account)
    this.save()
    return account
  }

  createOwner(username: string, password: string) {
    if (this.hasOwner) throw new AccountError(409, "There is already an owner.")
    const problem = passwordProblem(password, username)
    if (problem) throw new AccountError(400, problem)
    return this.add(username, "owner", password, false, null)
  }

  createMember(actor: Account, username: string, role: Role) {
    if (!canManage(actor, role)) throw new AccountError(403, "You cannot create an account with that role.")
    const password = temporaryPassword()
    const account = this.add(username, role, password, true, actor.username)
    return { account: toPublic(account), temporaryPassword: password }
  }

  resetPassword(actor: Account, id: string) {
    const target = this.find(id)
    if (!target) throw new AccountError(404, "No such account.")
    if (target.id === actor.id || !canManage(actor, target.role)) throw new AccountError(403, "You cannot reset this password.")
    const password = temporaryPassword()
    target.passwordHash = hashPassword(password)
    target.mustChangePassword = true
    this.data.sessions = this.data.sessions.filter((session) => session.accountId !== target.id)
    this.save()
    return { account: toPublic(target), temporaryPassword: password }
  }

  update(actor: Account, id: string, change: { role?: Role; disabled?: boolean }) {
    const target = this.find(id)
    if (!target) throw new AccountError(404, "No such account.")
    if (target.id === actor.id) throw new AccountError(403, "You cannot change your own role or access.")
    if (!canManage(actor, target.role) || (change.role && !canManage(actor, change.role))) {
      throw new AccountError(403, "You cannot change this account.")
    }
    if (change.role) target.role = change.role
    if (change.disabled !== undefined) target.disabled = change.disabled
    if (target.disabled) this.data.sessions = this.data.sessions.filter((session) => session.accountId !== target.id)
    this.save()
    return toPublic(target)
  }

  remove(actor: Account, id: string) {
    const target = this.find(id)
    if (!target) throw new AccountError(404, "No such account.")
    if (target.id === actor.id || !canManage(actor, target.role)) throw new AccountError(403, "You cannot remove this account.")
    this.data.accounts = this.data.accounts.filter((account) => account.id !== id)
    this.data.sessions = this.data.sessions.filter((session) => session.accountId !== id)
    this.save()
  }

  login(username: string, password: string, address: string) {
    const key = `${address}|${username.toLowerCase()}`
    const now = Date.now()
    const failure = this.failures.get(key)
    if (failure && failure.lockedUntil > now) {
      throw new AccountError(429, `Too many attempts. Try again in ${Math.ceil((failure.lockedUntil - now) / 1000)} seconds.`)
    }
    const account = this.byName(username)
    const valid = verifyPassword(password, account?.passwordHash ?? this.dummyHash) && account !== undefined && !account.disabled
    if (!valid || !account) {
      const entry = failure && now - failure.first < FAILURE_WINDOW_MS ? failure : { count: 0, first: now, lockedUntil: 0 }
      entry.count += 1
      if (entry.count >= FAILURE_LIMIT) {
        entry.lockedUntil = now + LOCK_MS
        entry.count = 0
        entry.first = now
      }
      this.failures.set(key, entry)
      throw new AccountError(401, "Wrong username or password.")
    }
    this.failures.delete(key)
    account.lastLoginAt = now
    return { account, token: this.startSession(account) }
  }

  startSession(account: Account) {
    const token = randomBytes(32).toString("base64url")
    const now = Date.now()
    this.data.sessions = this.data.sessions.filter((session) => session.expiresAt > now)
    this.data.sessions.push({ tokenHash: sha256(token), accountId: account.id, createdAt: now, expiresAt: now + SESSION_DAYS * 86_400_000 })
    this.save()
    return token
  }

  fromToken(token: string | undefined) {
    if (!token) return undefined
    const hash = sha256(token)
    const session = this.data.sessions.find((entry) => entry.tokenHash === hash)
    if (!session || session.expiresAt < Date.now()) return undefined
    const account = this.find(session.accountId)
    return account && !account.disabled ? account : undefined
  }

  logout(token: string | undefined) {
    if (!token) return
    const hash = sha256(token)
    this.data.sessions = this.data.sessions.filter((session) => session.tokenHash !== hash)
    this.save()
  }

  changePassword(account: Account, current: string, next: string, keepToken: string | undefined) {
    if (!verifyPassword(current, account.passwordHash)) throw new AccountError(400, "The current password is wrong.")
    if (current === next) throw new AccountError(400, "Pick a password different from the current one.")
    const problem = passwordProblem(next, account.username)
    if (problem) throw new AccountError(400, problem)
    account.passwordHash = hashPassword(next)
    account.mustChangePassword = false
    const keep = keepToken ? sha256(keepToken) : ""
    this.data.sessions = this.data.sessions.filter((session) => session.accountId !== account.id || session.tokenHash === keep)
    this.save()
  }
}

export const canManage = (actor: Account, role: Role) =>
  actor.role === "owner" ? role !== "owner" : actor.role === "admin" ? role === "moderator" : false

export const atLeast = (account: Account, role: Role) => ROLE_RANK[account.role] >= ROLE_RANK[role]
