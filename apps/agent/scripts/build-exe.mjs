import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

const agent = fileURLToPath(new URL("..", import.meta.url))
const panelOut = join(agent, "..", "panel", "out")
const dist = join(agent, "dist")
const work = join(dist, "work")
const executable = join(dist, process.platform === "win32" ? "Argus.exe" : "argus")
const EXCLUDED_PANEL_FOLDERS = ["fonts/"]

const pack = (root, exclude = []) => {
  const files = {}
  const walk = (folder) => {
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry)
      const key = relative(root, path).replaceAll("\\", "/")
      if (exclude.some((prefix) => key.startsWith(prefix))) continue
      if (statSync(path).isDirectory()) walk(path)
      else files[key] = readFileSync(path).toString("base64")
    }
  }
  walk(root)
  return files
}

if (!existsSync(join(panelOut, "index.html"))) {
  console.error("Build the panel first: npm run build --prefix apps/panel")
  process.exit(1)
}

rmSync(dist, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

await build({
  entryPoints: [join(agent, "src", "cli.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: join(work, "argus.cjs"),
  define: { "import.meta.url": "__argusUrl" },
  banner: { js: 'const __argusUrl = require("node:url").pathToFileURL(__filename).href;' },
  logLevel: "warning"
})

writeFileSync(join(work, "panel.json"), JSON.stringify(pack(panelOut, EXCLUDED_PANEL_FOLDERS)))
writeFileSync(join(work, "resource.json"), JSON.stringify(pack(join(agent, "resource", "argus"))))
writeFileSync(
  join(work, "sea-config.json"),
  JSON.stringify({
    main: join(work, "argus.cjs"),
    output: join(work, "sea-prep.blob"),
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    assets: { "panel.json": join(work, "panel.json"), "resource.json": join(work, "resource.json") }
  })
)

execFileSync(process.execPath, ["--experimental-sea-config", join(work, "sea-config.json")], { stdio: "inherit" })
copyFileSync(process.execPath, executable)
const postject = join(agent, "node_modules", "postject", "dist", "cli.js")
execFileSync(
  process.execPath,
  [postject, executable, "NODE_SEA_BLOB", join(work, "sea-prep.blob"), "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", "--overwrite"],
  { stdio: "inherit" }
)
rmSync(work, { recursive: true, force: true })
console.log(`Built ${executable} (${(statSync(executable).size / 1024 / 1024).toFixed(1)} MB)`)
