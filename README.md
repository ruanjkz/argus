# Argus

An open source server manager for FiveM, inspired by txAdmin. Early development: the panel still runs on mocked data and the agent has not been tested against a real FXServer yet.

## Apps

| Path | What it is |
| --- | --- |
| `apps/agent` | FXServer supervisor built with [Effect](https://effect.website) |
| `apps/panel` | Admin panel UI (Next.js, mocked data for now) |
| `apps/web` | Landing page (Next.js) |

## Agent

- Spawns FXServer, streams stdout and stderr, and reads structured traces from fd3.
- Marks the server online when the `argus` resource sends its first heartbeat.
- Restarts on crash, boot timeout or lost heartbeat, with backoff.
- Waits longer while the port is busy, and gives up after repeated failed starts.
- Stops gracefully with `quit`, then kills the process tree if it does not exit in time.
- Commands sent to the console cannot be chained with `;` or line breaks.

Run it against the bundled simulated server:

```bash
cd apps/agent
npm install
npm run dev
```

Type console commands, or `:start`, `:stop`, `:restart`, `:status` and `:exit`.

To supervise a real server, copy `apps/agent/resource/argus` into your resources folder, add `ensure argus` to your config, and set:

| Variable | Example |
| --- | --- |
| `ARGUS_FXSERVER` | `C:/fxserver/FXServer.exe` |
| `ARGUS_FXSERVER_ARGS` | `+exec server.cfg` |
| `ARGUS_FXSERVER_CWD` | `C:/fxserver/server-data` |

Tests use the simulated server, so they never touch a real FiveM install:

```bash
npm test
```

## Panel and landing

```bash
cd apps/panel
npm install
npm run dev
```

The landing page in `apps/web` runs the same way.

## License

[MIT](LICENSE)
