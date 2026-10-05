// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The mux worker: hosts one terminal-multiplexer session for noskills-server.
 *
 * The daemon spawns this over a Unix socket and speaks newline-delimited JSON to
 * it. It is the only worker that still runs as a subprocess — agent sessions are
 * served in-process by the Go ACP worker (see pkg/ajan/acpfx/inprocess.go), and
 * spawn no JavaScript at all. A terminal pane's content channel is VT bytes
 * rather than protocol messages, which is why this one stays a process.
 *
 * This file wires the protocol logic in worker.ts to the socket and the
 * process. It is runtime-agnostic: it imports node: builtins (through deps.ts)
 * plus workspace packages by bare specifier, which Deno and Bun execute directly
 * and Node runs with a TypeScript loader. `workerRuntime` in
 * pkg/ajan/noskillsserverfx/worker.go picks whichever is present;
 * NOSKILLS_WORKER_RUNTIME pins one.
 *
 * @module
 */

import * as deps from "./deps.ts";
import * as worker from "./worker.ts";

const socketPath = deps.process.argv[2];

if (socketPath === undefined || socketPath === "") {
  deps.process.stderr.write("[mux-worker] missing socket path argument\n");
  deps.process.exit(1);
}

const reportError = (message: string): void => {
  deps.process.stderr.write(`[mux-worker] ${message}\n`);
};

const socket = deps.net.createConnection({ path: socketPath });

const muxWorker = worker.createMuxWorker({
  cwd: deps.process.cwd(),
  host: {
    send: (message) => {
      if (!socket.destroyed) {
        socket.write(`${JSON.stringify(message)}\n`);
      }
    },
    reportError,
    exit: (code) => {
      socket.destroy();
      deps.process.exit(code);
    },
  },
});

socket.on("connect", () => muxWorker.start());

socket.on("data", (chunk: Uint8Array) => muxWorker.receive(chunk));

socket.on("error", (error: Error) => {
  reportError(`daemon socket: ${error.message}`);
  deps.process.exit(1);
});

socket.on("close", () => {
  // stop() reports its own failure, so the promise never rejects.
  void muxWorker.stop();
});
