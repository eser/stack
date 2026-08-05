// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * noskills-server mux worker — one process per *mux* session (a remote terminal
 * multiplexer), the counterpart to {@link ./worker.ts} (the Claude Agent SDK
 * worker). The daemon spawns this when a session is created with `kind: "mux"`.
 *
 * Run under **Deno** (`deno run -A mux-worker.ts <unix-socket-path>`): it imports
 * `@eserstack/mux`, whose `.ts` / workspace specifiers tsx and node cannot
 * resolve. The Unix socket uses `node:net` so the wire behaviour matches the SDK
 * worker cross-platform.
 *
 * Wire protocol (line-delimited JSON over the Unix socket):
 *
 *   Daemon → Worker:
 *     {type:"query_start", cwd, sessionId, resume?}   // open the first tab
 *     {type:"mux", frame}                             // a mux FrontendToServer
 *     {type:"shutdown"}
 *
 *   Worker → Daemon:
 *     {type:"ready"}
 *     {type:"spawn_progress", stage:"starting"|"ready"}
 *     {type:"mux", v:1, frame}                        // a mux ServerToFrontend
 *
 * Every `{type:"mux"}` event the daemon receives is appended to its ledger with
 * a `seq` and fanned out, so replay / `?after=` / multi-client all keep working
 * unchanged — the daemon never has to understand the mux protocol itself.
 *
 * @module
 */

import process from "node:process";
import * as net from "node:net";
import * as mux from "@eserstack/mux";
import { sanitizeRemoteTransport } from "@eserstack/mux/engine";
import { buildAgentSpawnResolver } from "@eserstack/noskills/session";

const socketPath = process.argv[2];

if (socketPath === undefined || socketPath === "") {
  process.stderr.write("[mux-worker] missing socket path argument\n");
  process.exit(1);
}

// ── Connection ───────────────────────────────────────────────────────────────

let conn: net.Socket | null = null;
let readBuffer = "";

const sendToDaemon = (msg: Record<string, unknown>): void => {
  if (conn === null || conn.destroyed) return;
  conn.write(JSON.stringify(msg) + "\n");
};

// ── Mux server ───────────────────────────────────────────────────────────────

// Captured from query_start so the spawn resolver can stamp the noskills env.
let sessionCwd = process.cwd();
let sessionId = "";

const server = mux.createServer({
  // The browser frontend reports its own viewport on attach; this is just a seed.
  initialState: mux.engine.createInitialState({ cols: 120, rows: 40 }),
  // The shared resolver, not a fourth copy. Both values are getters because
  // this worker learns its cwd and session at query_start, which arrives after
  // the server is built -- passing them by value would freeze them at whatever
  // they were at process start.
  resolveSpawn: buildAgentSpawnResolver(() => sessionCwd, {
    sessionId: () => sessionId,
  }),
  // A remote session outlives any single tab; closing the last one leaves an
  // empty multiplexer the client can repopulate.
  exitOnEmpty: false,
});

// Bridge the mux server to the daemon socket: every server→frontend frame is
// wrapped as a {type:"mux"} event; incoming {type:"mux"} commands are delivered
// back to the server. The daemon relays both directions verbatim.
let muxHandler: ((frame: mux.FrontendToServer) => void) | null = null;

const transport: mux.Transport<mux.ServerToFrontend, mux.FrontendToServer> = {
  send(frame: mux.ServerToFrontend): void {
    sendToDaemon({ type: "mux", v: 1, frame });
  },
  onMessage(handler: (frame: mux.FrontendToServer) => void): void {
    muxHandler = handler;
  },
  close(): void {
    muxHandler = null;
  },
};

// Sanitised at the transport, not relayed verbatim. Every frame here arrived
// over WebTransport and the daemon forwards it as opaque JSON, so without this
// a remote client could send `newTab`/`newPane` naming any command, args and
// cwd and have this process execute it with the daemon's full environment. The
// in-process web bridge has always done this; the daemon path never did.
server.connect(sanitizeRemoteTransport(transport));

// ── Daemon → worker dispatch ───────────────────────────────────────────────────

type DaemonMsg =
  | { type: "query_start"; cwd?: string; sessionId?: string; resume?: string }
  | { type: "mux"; frame: mux.FrontendToServer }
  | { type: "shutdown" | "stop_task" | "abort" };

const handleDaemonMessage = (msg: DaemonMsg): void => {
  switch (msg.type) {
    case "query_start":
      sessionCwd = msg.cwd ?? sessionCwd;
      sessionId = msg.sessionId ?? sessionId;
      // Open the first tab so a freshly-attached client sees a live pane.
      server.dispatch({
        type: "newTab",
        command: "claude",
        cwd: sessionCwd,
        title: "free",
        meta: { sessionId },
      });
      break;
    case "mux":
      muxHandler?.(msg.frame);
      break;
    case "shutdown":
    case "stop_task":
    case "abort":
      void server.dispose().finally(() => {
        conn?.destroy();
        process.exit(0);
      });
      break;
  }
};

// ── Main ───────────────────────────────────────────────────────────────────────

const client = net.createConnection({ path: socketPath }, () => {
  conn = client;
  sendToDaemon({ type: "spawn_progress", stage: "starting" });
  sendToDaemon({ type: "ready" });
  sendToDaemon({ type: "spawn_progress", stage: "ready" });
});

client.on("data", (chunk: Buffer) => {
  readBuffer += chunk.toString();
  const lines = readBuffer.split("\n");
  readBuffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    let msg: DaemonMsg;
    try {
      msg = JSON.parse(trimmed) as DaemonMsg;
    } catch {
      process.stderr.write(`[mux-worker] failed to parse: ${trimmed}\n`);
      continue;
    }

    try {
      handleDaemonMessage(msg);
    } catch (err) {
      const e = err as Error;
      process.stderr.write(`[mux-worker] dispatch error: ${e.message}\n`);
    }
  }
});

client.on("error", (err: Error) => {
  process.stderr.write(`[mux-worker] socket error: ${err.message}\n`);
  process.exit(1);
});

client.on("close", () => {
  void server.dispose().finally(() => process.exit(0));
});
