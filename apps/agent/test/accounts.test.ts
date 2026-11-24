import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assert, describe, it } from "@effect/vitest"
import { afterAll } from "vitest"

import { AccountStore, hashPassword, passwordProblem, temporaryPassword, usernameProblem, verifyPassword } from "../src/accounts.ts"

const homes: Array<string> = []
const freshStore = () => {
  const home = mkdtempSync(join(tmpdir(), "argus-accounts-"))
  homes.push(home)
  return { home, store: new AccountStore(home) }
}

afterAll(() => {
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

const failsWith = (run: () => unknown, status: number) => {
  try {
    run()
  } catch (error) {
    assert.strictEqual((error as { status?: number }).status, status)
    return
  }
  assert.fail(`expected a ${status} error`)
}

describe("passwords", () => {
  it("hashes with a salt and verifies", () => {
    const first = hashPassword("correct horse battery")
    assert.notStrictEqual(first, hashPassword("correct horse battery"))
    assert.isTrue(verifyPassword("correct horse battery", first))
    assert.isFalse(verifyPassword("wrong horse battery", first))
    assert.isFalse(verifyPassword("x", "plain"))
  })

  it("makes readable temporary passwords and checks the rules", () => {
    assert.match(temporaryPassword(), /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/)
    assert.isNotNull(passwordProblem("short"))
    assert.isNotNull(passwordProblem("lia.mod-is-great", "lia.mod"))
    assert.isNull(passwordProblem("a long enough secret"))
    assert.isNull(usernameProblem("lia.mod"))
    assert.isNotNull(usernameProblem("Lia Mod"))
  })
})

describe("AccountStore", () => {
  it("creates one owner and never stores the plain password", () => {
    const { home, store } = freshStore()
    assert.isFalse(store.hasOwner)
    const owner = store.createOwner("ruan", "a long enough secret")
    assert.isTrue(store.hasOwner)
    assert.strictEqual(owner.role, "owner")
    failsWith(() => store.createOwner("other", "a long enough secret"), 409)
    assert.notInclude(readFileSync(join(home, "accounts.json"), "utf8"), "a long enough secret")
  })

  it("lets the owner invite staff who must change the temporary password", () => {
    const { store } = freshStore()
    const owner = store.createOwner("ruan", "a long enough secret")
    const { account, temporaryPassword: password } = store.createMember(owner, "lia.mod", "moderator")
    assert.isTrue(account.mustChangePassword)
    const { account: member, token } = store.login("lia.mod", password, "10.0.0.2")
    assert.strictEqual(store.fromToken(token)?.id, member.id)
    failsWith(() => store.changePassword(member, "wrong", "a brand new secret", token), 400)
    failsWith(() => store.changePassword(member, password, "short", token), 400)
    store.changePassword(member, password, "a brand new secret", token)
    assert.isFalse(member.mustChangePassword)
    assert.strictEqual(store.fromToken(token)?.id, member.id)
    failsWith(() => store.login("lia.mod", password, "10.0.0.2"), 401)
    assert.strictEqual(store.login("lia.mod", "a brand new secret", "10.0.0.2").account.id, member.id)
  })

  it("keeps admins from managing owners or other admins", () => {
    const { store } = freshStore()
    const owner = store.createOwner("ruan", "a long enough secret")
    const created = store.createMember(owner, "boss", "admin")
    const adminAccount = store.find(created.account.id)!
    failsWith(() => store.createMember(adminAccount, "other.admin", "admin"), 403)
    const moderator = store.createMember(adminAccount, "helper", "moderator")
    failsWith(() => store.resetPassword(adminAccount, owner.id), 403)
    assert.strictEqual(store.resetPassword(adminAccount, moderator.account.id).account.mustChangePassword, true)
    failsWith(() => store.update(adminAccount, adminAccount.id, { role: "moderator" }), 403)
  })

  it("signs out disabled and removed accounts", () => {
    const { store } = freshStore()
    const owner = store.createOwner("ruan", "a long enough secret")
    const { account, temporaryPassword: password } = store.createMember(owner, "helper", "moderator")
    const { token } = store.login("helper", password, "10.0.0.3")
    store.update(owner, account.id, { disabled: true })
    assert.isUndefined(store.fromToken(token))
    failsWith(() => store.login("helper", password, "10.0.0.3"), 401)
    store.remove(owner, account.id)
    assert.strictEqual(store.list().length, 1)
  })

  it("locks a name after repeated wrong passwords", () => {
    const { store } = freshStore()
    store.createOwner("ruan", "a long enough secret")
    for (let attempt = 0; attempt < 5; attempt++) failsWith(() => store.login("ruan", "nope", "10.0.0.9"), 401)
    failsWith(() => store.login("ruan", "a long enough secret", "10.0.0.9"), 429)
    assert.strictEqual(store.login("ruan", "a long enough secret", "10.0.0.10").account.username, "ruan")
  })

  it("survives a restart", () => {
    const { home, store } = freshStore()
    const owner = store.createOwner("ruan", "a long enough secret")
    const { token } = store.login("ruan", "a long enough secret", "127.0.0.1")
    const reopened = new AccountStore(home)
    assert.strictEqual(reopened.fromToken(token)?.id, owner.id)
    reopened.logout(token)
    assert.isUndefined(new AccountStore(home).fromToken(token))
  })
})
