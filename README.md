# Argus

An open source server manager for FiveM, inspired by txAdmin. It runs on the same machine as your server and gives you and your staff a panel for the console, players, bans, resources and deploys.

Early development: it has been tested end to end against a simulated FXServer, not yet against a real one.

## Install on Windows

1. Download `Argus.exe` from the [releases page](https://github.com/ruanjkz/argus/releases).
2. Put it anywhere on the machine that runs FXServer and open it.
3. Your browser opens the setup. Pick your server from the list (or paste its folder), confirm where `FXServer.exe` is, create your owner account and click Install.

Argus copies its small resource to `resources/[argus]/argus`, adds `ensure argus` to `server.cfg` (keeping the original as `server.cfg.before-argus`) and starts the server. Keep the Argus window open; closing it stops the server gracefully.

Windows may warn that the file is from an unknown publisher, because the executable is not signed yet.

## Install on Linux, or from source

On Linux, download `argus-linux.tar.gz` from the [releases page](https://github.com/ruanjkz/argus/releases), extract it and run `./argus`. To run from source instead, you need [Node.js 22](https://nodejs.org) or newer and [Git](https://git-scm.com).

```bash
git clone https://github.com/ruanjkz/argus.git
cd argus
npm run setup
npm link
argus
```

`argus` opens the same setup in the browser. Prefer the terminal? `argus init` asks two questions instead. `argus doctor` checks what is missing, and `argus --simulate` runs a fake FXServer so you can look around without touching a server.

## Your staff

The owner creates logins in Settings, Team. Each member gets a temporary password and must pick their own on the first sign in. Roles:

| Role | Can |
| --- | --- |
| Owner | Everything, including settings, the repository and remote access |
| Admin | Start, stop and restart, run any command, manage moderators, revoke bans |
| Moderator | Watch the console, say, kick, warn and ban players |

To let staff in from their own computers, the owner turns on Settings, Remote access. Argus then listens on every network of the machine. Open TCP 3200 in the firewall, and put Argus behind HTTPS (for example a Cloudflare Tunnel) before using it over the internet, since plain http sends passwords unencrypted.

## What works

- **Server:** start, stop and restart, crash and hang detection with automatic restarts, daily restarts with chat warnings.
- **Console:** live output and commands, filtered by role.
- **Problems:** script errors from Lua and JavaScript resources, stalls and outages grouped with impact and a likely fix from fixed rules. Nothing in Argus depends on AI. TypeScript errors point at the original `.ts` line through source maps, and with Git, at the commit that introduced them.
- **Players:** who is online with their identifiers, play time, history, and accounts linked by token, Discord or IP. Warn, kick, message, note and ban.
- **Bans:** by player or by identifier, with expiry and revoke. The `argus` resource enforces them when players connect.
- **Resources:** everything in the resources folder with its live state, dependencies, and ensure, start and stop per resource or per `[folder]`.
- **Deploys:** connect a repository with a read-only deploy key Argus creates. Argus shows the history, fetches new commits, fast forwards the resources folder and restarts, and refuses while files were edited on the server outside Git.
- **FXServer builds:** download the recommended, latest, optional or critical build from FiveM, switch between them and delete old ones from Settings, FXServer. Builds live in the Argus folder, away from your server files.
- **Updates:** the sidebar shows when a newer Argus release is out.
- **Languages:** English, Spanish and Brazilian Portuguese.

## Development

| Path | What it is |
| --- | --- |
| `apps/agent` | The `argus` CLI and agent: supervises FXServer, serves the panel and its API on one port. Built with [Effect](https://effect.website). |
| `apps/panel` | The panel (Next.js static export). Without a running agent it opens in demo mode with sample data. |
| `apps/agent/resource/argus` | The FiveM resource: heartbeat, players, resource states, bans, warn and kick. |

```bash
npm test                                         # agent tests, all against a simulated server
npm run dev --prefix apps/panel -- --port 3200   # panel in demo mode
npm run build:exe                                # builds apps/agent/dist/Argus.exe
```

## Releasing

```bash
npm run release minor               # or patch, major, or an exact version like 0.3.0-beta.1
git push origin main --follow-tags
```

`npm run release` bumps the version in every manifest, commits `chore(release): vX.Y.Z` and tags it. The pushed tag starts the Release workflow, which tests the agent, builds `Argus.exe` on Windows and `argus-linux.tar.gz` on Linux, and publishes a GitHub release with both files, `SHA256SUMS.txt` and generated notes. Tags with a suffix such as `-beta.1` are published as pre-releases. Every push and pull request also runs CI: agent types and tests on Windows and Linux, and the panel's types, lint and build.

The landing page lives in [argus-site](https://github.com/ruanjkz/argus-site).

## License

[MIT](LICENSE)
