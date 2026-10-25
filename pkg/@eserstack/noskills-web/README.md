# 🖥️ [@eserstack/noskills-web](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/noskills-web` is
> published on npm under the same name (`pnpm add @eserstack/noskills-web`); the
> JSR versions stay available but get no updates.

> **eserstack Product** · [eser/stack on GitHub](https://github.com/eser/stack)
> · **Install:** `pnpm add jsr:@eserstack/noskills-web`

`@eserstack/noskills-web` is the browser dashboard that `noskills web` starts.
One local server on 127.0.0.1 shows the specs of a noskills project, a spec page
with its tasks, open questions and phase actions, and coding-agent tabs rendered
with xterm.js. The pages are HTML rendered from TypeScript templates, with plain
browser scripts and no build step. The server listens, accepts the `/mux`
WebSocket and handles Ctrl+C through `runtime.http` and `runtime.process` from
`@eserstack/standards/cross-runtime`, so it calls no runtime-specific API
itself.

## Quick Start

In a project where you have run `noskills init`, start the dashboard from the
noskills command line:

```bash
noskills web                    # serves http://localhost:3000
noskills web --port=4000 --open # another port, and open the browser
```

To start the same server from your own code, pass the project root:

```typescript
import * as noskillsWeb from "@eserstack/noskills-web";

await noskillsWeb.startServer({ root: ".", port: 3000 });
```

`startServer` prints the dashboard URL and resolves once the server stops, which
happens when its `signal` aborts. Ctrl+C closes every tab, kills the agent
processes, removes their session files and exits the process.

## Server

### `startServer(options)`

| Option     | Type                | Default                   | Description                                                                 |
| ---------- | ------------------- | ------------------------- | --------------------------------------------------------------------------- |
| `root`     | `string`            |                           | Project root that holds the `.eser/` directory                              |
| `port`     | `number`            | `3000`                    | Port to listen on; the server binds to 127.0.0.1 only. `0` picks a free one |
| `open`     | `boolean`           | `false`                   | Opens the dashboard in the default browser after the server listens         |
| `signal`   | `AbortSignal`       |                           | Stops the server when aborted, for tests and embedding                      |
| `onListen` | `(address) => void` |                           | Called once the server listens, with `{ hostname, port }`                   |
| `logger`   | `RequestLogger`     | the `noskills-web` logger | Receives the error records, see [Logging](#logging)                         |

Stop a server you started from code with an `AbortController`. With `port: 0`,
`onListen` tells you the port the system picked:

```typescript
import * as noskillsWeb from "@eserstack/noskills-web";

const controller = new AbortController();
const server = noskillsWeb.startServer({
  root: ".",
  port: 0,
  signal: controller.signal,
  onListen: ({ port }) => {
    console.log(`listening on ${port}`);
  },
});

// When you are done with it:
controller.abort();
await server;
```

### Routes

| Method        | Path                                                | Purpose                                                       |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `GET`         | `/`                                                 | Dashboard: spec list, pending mentions, agent tabs            |
| `GET`         | `/spec/:name`                                       | Spec page with tasks, questions and the phase actions         |
| `GET`         | `/events`                                           | Server-Sent Events stream of dashboard events                 |
| `GET`         | `/api/state`                                        | Dashboard state as JSON                                       |
| `GET`         | `/api/tabs`                                         | Open tabs as JSON                                             |
| `GET`         | `/api/spec/:name/ledger`, `/api/spec/:name/summary` | Decision ledger records, or only the maturity summary         |
| `POST`        | `/api/spec/:name/:action`                           | `approve`, `note`, `question`, `signoff`, `reply`, `complete` |
| `POST`        | `/api/tab`                                          | Open an agent tab, bound to a spec with `{ "spec": "name" }`  |
| `DELETE`      | `/api/tab/:id`                                      | Close a tab                                                   |
| `GET` upgrade | `/mux?token=...`                                    | WebSocket that carries the whole multiplexer                  |
| `GET`         | `/static/*`, `/sw.js`, `/manifest.json`             | Browser scripts, styles and the PWA files                     |

`note`, `question` and `reply` read `text` from the JSON body, and `reply` also
reads `mentionId`. An action the dashboard refuses, such as approving a spec in
the wrong phase or an unknown action name, answers status 400 with
`{ "ok": false, "error": "..." }`. The error message names the problem.

An approved spec has no web action that starts execution. Start it from the
coding agent with `noskills spec your_spec_name next`, for example in an agent
tab bound to the spec.

A fault answers with a fixed message and the request id:
`{ "ok": false, "error": "Action could not be completed", "requestId": "..." }`
for a failed action (status 400), and `"Request could not be completed"` with
status 500 when a route throws. The cause stays out of the response and goes to
the log under the same request id.

### Logging

The server logs each fault through `@eserstack/logging`, under the
`noskills-web` category, as one error record. The record carries `requestId`,
`method`, `path` (never the query string, which holds the `/mux` token) and the
caught `error` with its stack and causes. A failed action also adds `spec` and
`action`. Names and emails from the request body are not logged.

`noskills web` configures nothing, and `@eserstack/logging` then writes its
records to stderr, so the detail appears in the terminal that runs the server.
To send the records elsewhere, pass a `logger`: any object with `with(fields)`
and `error(message)`, such as a `Logger` from `@eserstack/logging`:

```typescript
import * as logging from "@eserstack/logging";
import * as noskillsWeb from "@eserstack/noskills-web";

await noskillsWeb.startServer({
  root: ".",
  logger: logging.logger.getLogger(["your_app", "dashboard"]),
});
```

### Access Control

Binding to 127.0.0.1 keeps other machines out, but any page open in your browser
can still send requests to localhost and open WebSockets to it. The server
therefore checks two things before it changes state:

- The `Origin` header, when present, must be `http://localhost:<port>`,
  `http://127.0.0.1:<port>` or `http://[::1]:<port>`. This applies to every
  `POST`, `PUT`, `PATCH`, `DELETE` and to `/mux`.
- A per-process token must match: in the `x-noskills-token` header on mutating
  requests, and in the `token` query parameter on `/mux`. Mutating requests
  other than `DELETE` must also send `content-type: application/json`, which an
  HTML form cannot post across origins.

The dashboard page carries the token in a `<meta name="noskills-token">` tag,
and `static/client.js` sends it with every mutating call. Every HTML page sends
a Content-Security-Policy that allows scripts only from the server itself and
from `cdn.jsdelivr.net/npm/`, and the xterm.js files from jsDelivr load with
Subresource Integrity digests.

### Environment Variables

| Name                        | Required | Default                   | Purpose                                                                                       |
| --------------------------- | -------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `NOSKILLS_WEB_TOKEN`        | No       | A fresh token per process | Fixes the access token, so a trusted tool can call the API without reading the dashboard HTML |
| `NOSKILLS_WEB_DEBUG_ERRORS` | No       | Off                       | `1` or `true` adds the underlying error text to fault responses as `detail`                   |

For example, `NOSKILLS_WEB_TOKEN=your_access_token noskills web` lets a script
send `x-noskills-token: your_access_token`. Leave `NOSKILLS_WEB_DEBUG_ERRORS`
unset outside debugging: the detail can contain file paths of your machine.

## Agent Tabs

### `MuxHost`

`MuxHost` owns the multiplexer behind the dashboard: one `@eserstack/mux` server
for every tab, pane and PTY, plus the noskills session bound to each tab.
`startServer` creates one for you. Use it directly to drive tabs from your own
code:

```typescript
import * as noskillsWeb from "@eserstack/noskills-web";

const host = new noskillsWeb.MuxHost(".");

// Starts the coding agent (Claude Code by default) in a new tab bound to a spec.
const tab = await host.createTab("your_spec_name");
host.notifySpec("your_spec_name", "\n[noskills: review requested]\n");

console.log(host.listTabs()); // [{ id, specName, sessionId }]
host.closeTab(tab.id);
await host.killAll();
```

| Member                       | Description                                                           |
| ---------------------------- | --------------------------------------------------------------------- |
| `createTab(specName?)`       | Starts the agent in a new tab and records a noskills session for it   |
| `closeTab(tabId)`            | Closes one tab without moving the active tab                          |
| `findTabBySpec(specName)`    | The tab bound to a spec, or `undefined`                               |
| `notifySpec(specName, text)` | Types `text` into the PTY of the spec's focused pane; `false` if none |
| `listTabs()`                 | Open tabs as `WebTab` values: `id`, `specName`, `sessionId`           |
| `killAll()`                  | Closes every pane and PTY and deletes the tabs' session files         |
| `attachSocket(socket)`       | Connects a browser WebSocket to the multiplexer (see below)           |

The `/mux` route calls `attachSocket` after it checks the Origin and the token;
authenticate a socket the same way before you attach it. Every frame from the
socket passes the `@eserstack/mux` remote sanitizer, so a frame cannot choose
the command, arguments or directory of a new pane. One socket is connected at a
time: attaching a new one closes the old one, and the panes keep running while
no socket is connected.

## Browser Scripts

The files in `static/` load as plain `<script>` tags:

- `mux-render.js` draws a mux scene with one xterm.js terminal per pane and
  exposes `globalThis.MuxRender`. It does not know the transport.
- `client.js` connects `MuxRender` to `/mux` over a WebSocket, follows
  `/events`, and sends the tab and spec actions.
- `mux-remote.js` exposes `globalThis.startRemoteMux(...)`, which renders the
  same scene from a `noskills-server` daemon over WebTransport. Its header marks
  it as not yet tested against a live daemon.
- `sw.js` and `sw-register.js` register the service worker that shows push
  notifications. On a page served over HTTPS, which is the `noskills-server`
  daemon, `sw-register.js` also hands the worker the daemon's certificate
  fingerprint from `/api/cert-fingerprint`. The plain-HTTP dashboard has no
  certificate, so it skips that request.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `MuxHost` no longer has a public `server` field. Connect a browser WebSocket,
  after authenticating it, with `host.attachSocket(socket)`. Code that drove the
  mux server directly (`dispatch`, `getState`, `dispose`) creates its own with
  `mux.createServer` from `@eserstack/mux`.
- A route that throws answers 500 JSON
  `{ ok: false, error: "Request could not be completed", requestId }` instead of
  the runtime's default 500, and an `Action could not be completed` fault
  carries `requestId`. Use `requestId` to find the server log record.
- Server errors are written as `@eserstack/logging` records (JSON lines on
  stderr, category `noskills-web`) instead of `[noskills-web] reason: <error>`
  console lines. Read the JSON records, or pass your own `logger` to
  `startServer`.
- Ctrl+C runs the graceful shutdown on Node and Bun too, and the SIGINT listener
  is removed once the server stops. An embedder that relied on Node's default
  Ctrl+C exit while the server runs gets the shutdown instead.

## 🔗 Links

- [eser/stack on GitHub](https://github.com/eser/stack)
- [`@eserstack/noskills`](../noskills/README.md): the `noskills` command and the
  dashboard state this package renders
- [`@eserstack/mux`](../mux/): the terminal multiplexer behind the agent tabs
- [`@eserstack/logging`](../logging/README.md): the logger behind the server's
  error records
- [`noskills-server`](../../../cmd/noskills-server/README.md): the daemon that
  `mux-remote.js` attaches to
