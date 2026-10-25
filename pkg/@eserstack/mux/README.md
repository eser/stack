# 🪟 [@eserstack/mux](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/mux` is published on
> npm under the same name (`pnpm add @eserstack/mux`); the JSR versions stay
> available but get no updates.

`@eserstack/mux` is the core of a terminal multiplexer: tabs, split panes,
keybinding modes and the processes running in them. A pure engine (split tree,
geometry, reducer) holds the state, a server owns the pseudo-terminals and turns
reducer effects into I/O, and frontends draw what the server sends. The server
speaks one neutral protocol over any transport, so the same session can drive
the ANSI terminal frontend in this package or a browser frontend over a
WebSocket.

Install it with `pnpm add jsr:@eserstack/mux`.

## Quick Start

Run the server and the terminal frontend in one process, with your shell in the
first pane:

```typescript
import * as mux from "@eserstack/mux";

const exitCode = await mux.runInProcess();
```

Run it in a real terminal. Press `ctrl+p` then `v` or `s` to split, `h`, `j`,
`k`, `l` to move focus and `x` to close a pane; `ctrl+t` then `n` for a new tab
and `h` or `l` to switch tabs; `ctrl+q` to quit. A pane gets a real
pseudo-terminal when the `@eserstack/ajan` native library is available and falls
back to the `script` command on macOS and Linux otherwise.

`runInProcess` accepts `shell`, `shellArgs` and `cwd` for terminal panes, or a
`resolveSpawn` function that decides what every pane runs.

## Composing the Pieces

`runInProcess` wires the parts below together; wire them yourself to change the
keymap, the chrome or the transport.

```typescript
import * as mux from "@eserstack/mux";

const server = mux.createServer({
  initialState: mux.engine.createInitialState({ cols: 120, rows: 40 }),
  resolveSpawn: () => ({ command: "/bin/sh", args: [] }),
});

const [serverSide, frontendSide] = mux.createInProcessPair<
  mux.ServerToFrontend,
  mux.FrontendToServer
>();
server.connect(serverSide);

const keymap = mux.keybindings.mergeOverrides(
  mux.keybindings.defaultKeymap,
  { normal: { "ctrl+b": { type: "switchMode", mode: "pane" } } },
);

const frontend = mux.createTuiFrontend({ transport: frontendSide, keymap });
server.dispatch({ type: "newTab" });

try {
  await frontend.run();
} finally {
  frontend.stop();
  await server.dispose();
}
```

| Part                  | Role                                                               |
| --------------------- | ------------------------------------------------------------------ |
| `createServer`        | Owns engine state and the pane processes, broadcasts scene updates |
| `createTuiFrontend`   | Draws the scene in the terminal and turns keys into actions        |
| `createInProcessPair` | Two connected transports for a server and frontend in one process  |
| `wsTransport`         | A transport over a `WebSocket`, with JSON messages                 |
| `createPtyHost`       | The default pseudo-terminal backend the server uses                |
| `createScheduler`     | Coalesces render requests into frames                              |

`createServer` options include `chrome` (rows and columns reserved for tab bar,
status bar and sidebars), `exitOnEmpty` (default `true`; set `false` for a
long-lived host that keeps an empty session when the last tab closes),
`onPaneExit`, and `createHost` to replace the pseudo-terminal backend in tests.
`server.dispatch(action)` drives the session from code, for example from an
agent.

## Remote Frontends

A message from a remote client can carry an action, and `newTab` and `newPane`
actions can name a command, arguments and a working directory. Wrap every
transport that crosses a network in `engine.sanitizeRemoteTransport`, which
strips those fields so the server's `resolveSpawn` alone decides what runs:

```typescript
import * as mux from "@eserstack/mux";

/** Attach a WebSocket whose client your server has already authenticated. */
export const attachRemote = (
  server: mux.MuxServer,
  socket: WebSocket,
): void => {
  const transport = mux.engine.sanitizeRemoteTransport(
    mux.wsTransport<mux.ServerToFrontend, mux.FrontendToServer>(socket, {
      onClose: () => server.disconnect(transport),
    }),
  );
  server.connect(transport);
};
```

Sanitizing is a second line of defence, not authentication: anyone who can open
the socket can type into your shells. The server serves one frontend at a time;
connecting a new transport closes the previous one, and the panes keep running
across reconnects.

## Keybindings

Keys are read per mode: `normal`, `pane`, `tab`, `resize`, `scroll` and
`locked`. In `normal` mode the reserved chords switch modes (`ctrl+p` pane,
`ctrl+t` tab, `ctrl+n` resize, `ctrl+s` scroll, `ctrl+g` locked) and every other
key goes to the focused pane. In `locked` mode only `ctrl+g` is intercepted, so
full-screen programs receive every key.

`keybindings.buildKeymap(table)` compiles a table of chords to actions,
`mergeOverrides(base, table)` layers your chords over a keymap, and
`lookup(keymap, mode, chord)` returns the actions bound to a chord.

## Engine

The engine is pure and has no I/O. `reduce(state, action)` returns the next
state and a list of effects (`spawnPty`, `writePty`, `killPty`, `scrollPane`,
`render`, `detach`, `exit`) for the server to carry out:

```typescript
import * as mux from "@eserstack/mux";

const initial = mux.engine.createInitialState({ cols: 80, rows: 24 });
const { state, effects } = mux.engine.reduce(initial, { type: "newTab" });

console.log(state.tabs.length); // 1
console.log(effects.map((effect) => effect.type)); // includes "spawnPty"
```

`engine.tree` and `engine.geometry` hold the split-tree operations and the pane
layout math, and `scene.deriveScene(state)` and `scene.diffScene(prev, next)`
build the frontend-neutral view and the delta the server sends.

## 🔗 Links

- [JSR package](https://jsr.io/@eserstack/mux): the API reference generated from
  source
- [eser/stack on GitHub](https://github.com/eser/stack)
