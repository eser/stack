# 🛰️ [ajan/noskillsserverfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/noskillsserverfx`. The module is not published
> for `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`noskillsserverfx` is the composition root of
[`noskills-server`](../../../cmd/noskills-server/README.md). It serves two
things. The daemon (`Server`) runs agent and mux sessions for every registered
project over HTTP/3 and WebTransport, behind a PIN. The dashboard (`Dashboard`)
is the browser interface of one project on 127.0.0.1 over HTTP/1.1: spec pages,
a JSON API, a Server-Sent Events stream and the `/mux` WebSocket that carries
the agent tabs. This page covers the dashboard; the daemon's commands, flags and
storage are in the `noskills-server` README.

## Dashboard

The dashboard is the Go form of the TypeScript `@eserstack/noskills-web`
package. Its pages are `html/template` files with the markup of the TypeScript
templates, and the browser scripts, the stylesheet and the PWA files are
embedded with `go:embed`, so the binary serves them with nothing on disk. The
spec state and actions come from `noskillsfx` (`GetDashboardState`,
`DashboardApprove` and the other `Dashboard*` actions), the same files the
noskills CLI reads and writes.

Run it from the command line with `noskills-server web` in a project where you
have run `noskills init`:

```bash
noskills-server web                    # serves http://localhost:3000
noskills-server web --port 4000 --open # another port, and open the browser
```

To serve it from your own code, build a `Dashboard` for the project root and
serve it on a listener. `Serve` returns once its context ends, after it closed
every agent tab:

```go
package main

import (
	"context"
	"log"
	"os"
	"os/signal"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/noskillsserverfx"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	dashboard, err := noskillsserverfx.NewDashboard(&noskillsserverfx.DashboardConfig{
		Root: "your_project_root",
	}, logfx.NewLogger())
	if err != nil {
		log.Fatal(err)
	}

	listener, err := noskillsserverfx.ListenDashboard(ctx, noskillsserverfx.DashboardDefaultPort)
	if err != nil {
		log.Fatal(err)
	}

	if err := dashboard.Serve(ctx, listener); err != nil {
		log.Fatal(err)
	}
}
```

`DashboardConfig` also takes `Token` (the access token; empty mints one per
process), `DebugErrors`, `Env` (the identity and clock of the spec actions),
`NewPtyHost` and `AgentCommand` (the pane backend and the agent binary, for
tests). `Dashboard.Handler(port)` returns the handler alone, for a server you
run yourself on that port.

### Routes

The URLs are the TypeScript server's:

| Method        | Path                                                  | Purpose                                                       |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| `GET`         | `/`                                                   | Dashboard: spec list, pending mentions, agent tabs            |
| `GET`         | `/spec/{name}`                                        | Spec page with tasks, questions and the phase actions         |
| `GET`         | `/events`                                             | Server-Sent Events stream of the project's dashboard events   |
| `GET`         | `/api/state`                                          | Dashboard state as JSON                                       |
| `GET`         | `/api/tabs`                                           | Open tabs as JSON                                             |
| `GET`         | `/api/spec/{name}/ledger`, `/api/spec/{name}/summary` | Decision ledger records, or only the maturity summary         |
| `POST`        | `/api/spec/{name}/{action}`                           | `approve`, `note`, `question`, `signoff`, `reply`, `complete` |
| `POST`        | `/api/tab`                                            | Open an agent tab, bound to a spec with `{ "spec": "name" }`  |
| `DELETE`      | `/api/tab/{id}`                                       | Close a tab                                                   |
| `GET` upgrade | `/mux?token=...`                                      | WebSocket that carries the whole multiplexer                  |
| `GET`         | `/static/*`, `/sw.js`, `/manifest.json`               | Browser scripts, styles and the PWA files                     |

An action the dashboard refuses, such as approving a spec in the wrong phase or
an unknown action name, answers status 400 with
`{ "ok": false, "error": "..." }`. A fault answers with a fixed message and the
request id, such as
`{ "ok": false, "error": "Action could not be completed", "requestId": "..." }`,
and the cause goes to the log under the same id as `request_id`, with `method`
and `path`. The query string is never logged, because the `/mux` upgrade carries
the token in it.

### Access control

Listening on 127.0.0.1 keeps other machines out, but any page open in your
browser can still send requests to localhost and open WebSockets to it. The
dashboard checks the same things the TypeScript server checked, in the same
order:

- The `Origin` header, when present, must be `http://localhost:<port>`,
  `http://127.0.0.1:<port>` or `http://[::1]:<port>` on every `POST`, `PUT`,
  `PATCH`, `DELETE` and on `/mux`.
- Mutating requests other than `DELETE` must send
  `Content-Type: application/json`, which an HTML form cannot post across
  origins.
- The access token must match, in the `X-Noskills-Token` header on mutating
  requests and in the `token` query parameter on `/mux`. The comparison runs in
  constant time.

The pages carry the token in a `<meta name="noskills-token">` tag, which only a
page loaded from an allowed origin can read. Every frame a `/mux` socket sends
passes the `muxfx` remote sanitizer, so a frame cannot choose the command,
arguments or directory of a new pane. One socket is attached at a time: a new
one closes the old one, and the panes keep running in between.

`noskills-server web` reads two environment variables:

| Name                        | Required | Default                   | Purpose                                                                                  |
| --------------------------- | -------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `NOSKILLS_WEB_TOKEN`        | No       | A fresh token per process | Fixes the access token, so a trusted tool can call the API without reading a page        |
| `NOSKILLS_WEB_DEBUG_ERRORS` | No       | Off                       | `1` or `true` adds the cause to fault responses as `detail`; it can name your file paths |

### Differences from the TypeScript dashboard

The Go dashboard keeps the URLs, the JSON shapes, the markup the browser scripts
rely on and the access checks. These differ on purpose:

- Every response carries the Content-Security-Policy (the TypeScript server sent
  it on pages only) and the `SecurityHeadersMiddleware` headers:
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy`.
- A JSON request body is read up to 1 MiB, and a `/mux` frame up to 1 MiB; a
  larger body reads as `{}`, as an unparsable one does, and a larger frame is
  skipped.
- The browser does not run xterm.js: the server emulates every pane and the page
  paints the screens it sends (see Terminal below). A browser that reads `/mux`
  slower than the panes write skips to the latest screen instead of queueing
  frames; only if 1024 scene frames pile up is it disconnected, and it then
  reconnects and gets a full scene.
- The `/api/spec/{name}/...` routes decode the spec name in the URL (the
  TypeScript API used it percent-encoded), and the notice typed into a spec's
  agent tab drops the control characters of the spec name as well as of the user
  name.
- `/spec/{name}` answers 404 for a spec path that is a file. A URL with a dot
  segment is redirected to its clean path first, as Go's `http.ServeMux` does.
- Only the files of the static table are served; the TypeScript server served
  any file under its `static/` directory.
- The request id is a version 4 UUID, as before, and log fields are snake_case
  (`request_id`) as in the rest of the daemon's logs.
- The task checkboxes are labelled with their task id.
- The pages load no third-party script or stylesheet, so the policy allows
  scripts and styles from the dashboard only, with no inline styles: the phase
  badges are colored by class, and the scripts set styles through the CSSOM.
  `connect-src` names the dashboard's own `ws://` origins.
- The pages have a skip link to the main content, and the terminal panes are
  labelled regions.

### Terminal

`static/client.js` attaches `/mux` and the server sends what each pane shows
(`muxfx` Screen Messages), which `static/mux-render.js` paints: one element per
row and one span per style run, as wide as the cells it covers, so wide
characters keep the grid. Only the rows a message changed are repainted. Colors
(16, 256 and truecolor), bold, dim, italic, the underline styles and their
color, inverse, strikethrough, overline, invisible and blinking text, and the
cursor's shape and blink come from the message's style table. Row text is put in
text nodes, never parsed as markup.

A hidden text area in each pane takes the keyboard. Each keydown goes to the
server as a `key` message; pasted text and IME compositions go as `paste`, focus
changes as `focus`, and mouse presses, releases, motion and the wheel as `mouse`
messages, but only while the program asked for mouse reports. The server encodes
them with the pane's modes. Keys the page keeps:

| Keys                                  | Action                                                              |
| ------------------------------------- | ------------------------------------------------------------------- |
| `Ctrl+Shift+L`                        | Move focus out of the terminal to the tab bar                       |
| `Shift+Page Up`, `Shift+Page Down`    | Scroll the pane's history (not on the alternate screen)             |
| `Ctrl+Shift+C`, `Ctrl+Shift+V`        | Copy the selection, paste                                           |
| `Command` or `Windows` key with a key | Left to the browser and the system (`Command+C`, `Command+V`, find) |
| Shift with the mouse                  | Select text while the program takes mouse reports                   |

The wheel scrolls the pane's own history (up to 5000 lines) when the program
takes no mouse reports and is not on the alternate screen; there it sends the
arrow keys, and with mouse reports it goes to the program. Typing returns to the
live screen. Selected text copies without the blanks that pad each row. OSC 8
hyperlinks and the plain `http` and `https` URLs in a row open in a new tab with
`rel="noopener noreferrer"`, and only for `http`, `https` and `mailto`; while
the program takes mouse reports a click is the program's, and `Ctrl` or
`Command` with the click opens the link.

`web/browser_scripts.test.ts` runs the browser scripts against stand-ins for the
DOM under `deno test`. It paints `testdata/claude_code_screens.json.gz`, the
screen messages the dashboard sends for the Claude Code session of the `muxfx`
fidelity corpus (the trust prompt, the start screen and `/help`), and compares
every row's text, the wide cells, each cell's style and the cursor with the
recorded screens. `TestDashboardPaintsTheClaudeCodeCorpus` makes those frames
and checks them the same way in Go; after a protocol change, regenerate the file
with:

```bash
go test ./pkg/ajan/noskillsserverfx/ -run TestDashboardPaintsTheClaudeCodeCorpus -update-screens
```

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/noskillsserverfx`: the API reference
  generated from source
- [`noskills-server`](../../../cmd/noskills-server/README.md): the commands,
  flags and storage of the daemon
- [ajan/muxfx](../muxfx/): the terminal multiplexer behind the agent tabs
- [eser/stack on GitHub](https://github.com/eser/stack)
