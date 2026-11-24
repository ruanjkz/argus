import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const input = (process.argv[2] ?? "").replace(/^v/, "")
const manifests = ["package.json", "apps/agent/package.json", "apps/panel/package.json"]
const locks = ["apps/agent/package-lock.json", "apps/panel/package-lock.json"]

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

const current = JSON.parse(readFileSync(join(root, "apps/agent/package.json"), "utf8")).version
const bump = (kind) => {
  const [major, minor, patch] = current.split("-")[0].split(".").map(Number)
  if (kind === "major") return `${major + 1}.0.0`
  if (kind === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
const version = ["major", "minor", "patch"].includes(input) ? bump(input) : input

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
  fail(`Usage: npm run release <major|minor|patch|x.y.z>\nCurrent version: ${current}`)
}
if (git("status", "--porcelain")) fail("Commit or stash your changes first.")
if (git("tag", "--list", `v${version}`)) fail(`Tag v${version} already exists.`)

const setVersion = (path, update) => {
  const file = join(root, path)
  const source = readFileSync(file, "utf8")
  const newline = source.includes("\r\n") ? "\r\n" : "\n"
  const data = JSON.parse(source)
  update(data)
  writeFileSync(file, JSON.stringify(data, null, 2).replace(/\n/g, newline) + newline)
}

for (const path of manifests) setVersion(path, (data) => (data.version = version))
for (const path of locks) {
  setVersion(path, (data) => {
    data.version = version
    if (data.packages?.[""]) data.packages[""].version = version
    if (data.packages?.["../.."]) data.packages["../.."].version = version
  })
}

git("add", ...manifests, ...locks)
git("commit", "-m", `chore(release): v${version}`)
git("tag", "-a", `v${version}`, "-m", `v${version}`)

console.log(`Tagged v${version}. Publish it with:\n  git push origin main --follow-tags`)
