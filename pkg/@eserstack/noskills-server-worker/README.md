# 🧵 [@eserstack/noskills-server-worker](./)

> **eserstack Internal** · [eser/stack on GitHub](https://github.com/eser/stack)
> · Run by `noskills-server`; not published

`@eserstack/noskills-server-worker` holds `mux-worker.ts`, the process that
[`noskills-server`](../../../cmd/noskills-server/README.md) starts for each
terminal-multiplexer session, and `worker.ts`, the protocol logic it runs. The
worker hosts one [`@eserstack/mux`](../mux/) server, whose panes run programs in
pseudo-terminals, and relays its frames to the daemon over a Unix socket. Agent
sessions do not use it: the daemon serves those in-process in Go. A terminal
pane's content is VT bytes rather than protocol messages, which is why mux
sessions still get a separate process.

## How the Daemon Runs It

When a client first attaches to a session with `?kind=mux`, the daemon opens a
Unix socket under its data directory and starts the worker with the socket path
as the only argument. It picks the first runtime it finds on the `PATH`:

```bash
deno run -A mux-worker.ts /path/to/session.sock
bun run mux-worker.ts /path/to/session.sock
node mux-worker.ts /path/to/session.sock
```

Deno and Bun run the TypeScript source as it is, and Node 26 or later strips the
types itself. The worker imports workspace packages by bare specifier, so the
script has to stay in this directory of an eser/stack checkout whose
dependencies are installed with `pnpm install`.

| Environment variable       | Default                                   | Purpose                                     |
| -------------------------- | ----------------------------------------- | ------------------------------------------- |
| `NOSKILLS_WORKER_RUNTIME`  | The first of `deno`, `bun`, `node` found  | Pins the runtime: `deno`, `bun` or `node`   |
| `NOSKILLS_MUX_WORKER_PATH` | `mux-worker.ts` next to the daemon binary | Path of the worker script the daemon starts |

For example, to point a daemon at this checkout and run the worker under Bun:

```bash
NOSKILLS_MUX_WORKER_PATH="$PWD/pkg/@eserstack/noskills-server-worker/mux-worker.ts" \
NOSKILLS_WORKER_RUNTIME=bun \
noskills-server start
```

## Socket Protocol

Both sides write one JSON object per line. Once connected, the worker sends
`{ "type": "spawn_progress", "stage": "starting" }`, `{ "type": "ready" }` and
`{ "type": "spawn_progress", "stage": "ready" }`. From the daemon it reads:

| Message                                         | What the worker does                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `{ "type": "query_start", "cwd", "sessionId" }` | Records the working directory and session (an empty value keeps the one it had), then opens a tab running `claude` |
| `{ "type": "mux", "frame" }`                    | Passes a frontend frame to the mux server                                                                          |
| `{ "type": "shutdown" }`, `stop_task`, `abort`  | Disposes the mux server and exits with code 0                                                                      |

Every frame the mux server sends goes back as
`{ "type": "mux", "v": 1, "frame" }`, and the daemon forwards it to the attached
clients. Frames from clients pass through `mux.engine.sanitizeRemoteTransport`
first, which strips the command, arguments and working directory from new tabs
and panes: a remote client names only a pane kind, and the worker's spawn
resolver decides what runs.

The worker ignores the messages the daemon sends to agent workers
(`push_message`, `permission_response`, `set_mode`). It writes the problems it
carries on after to stderr, which the daemon inherits: a line that is not JSON,
a message with no `type`, a `mux` message whose `frame` is not an object, or a
message the mux server fails to handle. A line that is not JSON is reported by
its length only, since lines carry terminal input.

It exits with code 1 when it gets no socket path, when the socket fails, or when
disposing the mux server fails, and with code 0 after a shutdown message or when
the daemon closes the connection.

## Tests

`worker.test.ts` covers the protocol logic with a fake PTY host, so no pane
starts a process. `mux-worker.test.ts` runs `mux-worker.ts` under Deno against a
stand-in daemon on a Unix socket. Both run with the repository's tests
(`deno task cli test`); to run only these:

```bash
deno test --allow-all pkg/@eserstack/noskills-server-worker/
```

## 🔗 Links

- [eser/stack on GitHub](https://github.com/eser/stack)
- [`noskills-server`](../../../cmd/noskills-server/README.md): the daemon that
  starts this worker
- [`@eserstack/mux`](../mux/): the multiplexer the worker hosts
- [`@eserstack/noskills-client`](../noskills-client/README.md): the client that
  sends and receives `mux` frames through the daemon
