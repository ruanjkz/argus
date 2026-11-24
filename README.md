# Argus

An open source server manager for FiveM, inspired by txAdmin. It runs on the same machine as your server: one command sets it up, one command starts the panel, the agent and FXServer together.

Early development. The server lifecycle, console, problems, settings and repository connection are real. Players, bans, resources and the deploy history in the panel still show sample data, and the panel says so on those pages.

## Install

You need [Node.js 22](https://nodejs.org) or newer and [Git](https://git-scm.com) (Git also brings `ssh-keygen`, used to connect a repository).

```bash
git clone https://github.com/ruanjkz/argus.git
cd argus
npm run setup
npm link
```

`npm link` puts the `argus` command on your PATH. Without it, use `npm run argus -- <command>` inside the folder.

## Link your server

```bash
argus init
```

It asks two things: the server data folder (the one with `server.cfg` and `resources`) and where `FXServer.exe` is, which it usually guesses. Then it shows what it will do and waits for a yes:

- copies the `argus` resource to `resources/[argus]/argus`
- adds `ensure argus` to the end of `server.cfg`, keeping the original as `server.cfg.before-argus`
- saves its settings to `~/.argus/argus.json`

It never starts or stops your server during setup. For scripts: `argus init --data <folder> --fxserver <path> --name <name> --yes`.

## Run

```bash
argus start
```

Opens the panel on http://localhost:3200 and starts FXServer. Ctrl+C stops the server gracefully, then Argus. The panel and the agent only listen on 127.0.0.1.

```bash
argus start --simulate   # a fake FXServer, nothing touches your server
argus doctor             # checks Node, Git, the settings, the resource and the ports
```

## How it fits together

| Path | What it is |
| --- | --- |
| `apps/agent` | The `argus` CLI and the agent: supervises FXServer, reads its output, finds problems, talks to Git. Built with [Effect](https://effect.website). |
| `apps/panel` | The panel (Next.js). Talks to the agent through `/api/agent`, which adds the agent token on the server side. |
| `apps/agent/resource/argus` | The FiveM resource that sends a heartbeat with the player count. |

The landing page lives in [argus-site](https://github.com/ruanjkz/argus-site).

## Agent

- Spawns FXServer, streams stdout and stderr, and reads structured traces from fd3.
- Marks the server online when the `argus` resource sends its first heartbeat.
- Restarts on crash, boot timeout or lost heartbeat, with backoff, and gives up after repeated failed starts.
- Restarts at the daily times set in the panel, warning players in chat first.
- Stops gracefully with `quit`, then kills the process tree if it does not exit in time.
- Groups script errors from Lua and JavaScript resources, stalls, hangs and outages into problems, measures their impact, and suggests a likely cause from fixed rules. Nothing in Argus depends on AI.
- Reads source maps, so an error in a TypeScript resource points at the original `.ts` line.
- With Git: lists files edited on the server outside a commit, and names the commit that introduced each error.
- Connects a repository with a read-only deploy key it creates on your machine. No account login, no token.

## Development

```bash
npm test                                   # agent tests, all against a simulated server
npm run dev --prefix apps/panel -- --port 3200
```

Without a running agent the panel starts in demo mode with sample data.

## License

[MIT](LICENSE)
