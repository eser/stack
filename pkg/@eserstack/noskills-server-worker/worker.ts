// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The mux worker's protocol logic, apart from the process that runs it.
 *
 * It hosts one mux server, wraps every frame the server sends as a
 * `{ type: "mux", v: 1, frame }` message for the daemon, and handles the
 * newline-delimited JSON messages the daemon sends back: `query_start`, `mux`,
 * and `shutdown`, `stop_task` or `abort`. The daemon also sends messages meant
 * for agent workers (`push_message`, `permission_response`, `set_mode`); this
 * worker ignores them.
 *
 * `mux-worker.ts` connects it to the daemon's Unix socket and to the process.
 *
 * @module
 */

import * as mux from "@eserstack/mux";
import * as session from "@eserstack/noskills/session";

/** What the worker needs from the process that runs it. */
export type WorkerHost = {
  /** Writes one message to the daemon as a JSON line. */
  readonly send: (message: Readonly<Record<string, unknown>>) => void;
  /** Reports a problem the worker carries on after. */
  readonly reportError: (message: string) => void;
  /** Ends the process. Called once, after the mux server is disposed. */
  readonly exit: (code: number) => void;
};

export type MuxWorkerOptions = {
  readonly host: WorkerHost;
  /** Working directory for new panes until `query_start` names one. */
  readonly cwd: string;
  /** Replaces the PTY host, so tests can run panes without processes. */
  readonly createPtyHost?: mux.MuxServerOptions["createHost"];
};

export type MuxWorker = {
  /** Sends the ready handshake. Call it once the socket is connected. */
  readonly start: () => void;
  /** Takes bytes read from the socket and handles every complete line. */
  readonly receive: (chunk: Uint8Array) => void;
  /**
   * Disposes the mux server, then exits with code 0, or with code 1 when
   * disposal fails. Later calls return the same promise.
   */
  readonly stop: () => Promise<void>;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value instanceof Object && !Array.isArray(value);

/** Reads a string field; an empty string counts as absent. */
const readString = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | null => {
  const value = record[key];

  return typeof value === "string" && value !== "" ? value : null;
};

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Builds a worker around a new mux server. */
export const createMuxWorker = (options: MuxWorkerOptions): MuxWorker => {
  const host = options.host;

  // Learned at query_start, which arrives after the server is built, so the
  // spawn resolver reads them through getters instead of copying them now.
  let sessionCwd = options.cwd;
  let sessionId = "";

  const server = mux.createServer({
    // The browser frontend reports its own viewport on attach; this is a seed.
    initialState: mux.engine.createInitialState({ cols: 120, rows: 40 }),
    resolveSpawn: session.buildAgentSpawnResolver(() => sessionCwd, {
      sessionId: () => sessionId,
    }),
    // A remote session outlives any single tab; closing the last one leaves an
    // empty multiplexer the client can repopulate.
    exitOnEmpty: false,
    createHost: options.createPtyHost,
  });

  let muxHandler: ((frame: mux.FrontendToServer) => void) | null = null;

  const transport: mux.Transport<mux.ServerToFrontend, mux.FrontendToServer> = {
    send(frame: mux.ServerToFrontend): void {
      host.send({ type: "mux", v: 1, frame });
    },
    onMessage(handler: (frame: mux.FrontendToServer) => void): void {
      muxHandler = handler;
    },
    close(): void {
      muxHandler = null;
    },
  };

  // Every frame from the daemon came from a remote client over WebTransport,
  // and the daemon forwards it as opaque JSON. Without the sanitizer, a client
  // could send `newTab` or `newPane` naming any command, arguments and working
  // directory, and this process would run it with the daemon's environment.
  server.connect(mux.engine.sanitizeRemoteTransport(transport));

  let stopping: Promise<void> | null = null;

  const stop = (): Promise<void> => {
    if (stopping === null) {
      stopping = server.dispose().then(
        () => host.exit(0),
        (error: unknown) => {
          host.reportError(`dispose the mux server: ${describe(error)}`);
          host.exit(1);
        },
      );
    }

    return stopping;
  };

  const handleMessage = (
    type: string,
    message: Readonly<Record<string, unknown>>,
  ): void => {
    switch (type) {
      case "query_start": {
        sessionCwd = readString(message, "cwd") ?? sessionCwd;
        sessionId = readString(message, "sessionId") ?? sessionId;
        // Open the first tab so a freshly attached client sees a live pane.
        server.dispatch({
          type: "newTab",
          command: "claude",
          cwd: sessionCwd,
          title: "free",
          meta: { sessionId },
        });
        break;
      }
      case "mux": {
        const frame = message["frame"];
        if (!isRecord(frame)) {
          host.reportError(
            `skip a "mux" message whose "frame" is not an object`,
          );
          break;
        }
        // The mux server ignores frames whose `t` it does not know.
        muxHandler?.(frame as mux.FrontendToServer);
        break;
      }
      case "shutdown":
      case "stop_task":
      case "abort":
        // stop() reports its own failure, so the promise never rejects.
        void stop();
        break;
    }
  };

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (trimmed === "") {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Only the length: lines carry terminal input, which can hold secrets.
      host.reportError(
        `skip a daemon line of ${trimmed.length} characters that is not JSON`,
      );
      return;
    }

    if (!isRecord(parsed)) {
      host.reportError("skip a daemon line that is not a JSON object");
      return;
    }

    const type = readString(parsed, "type");
    if (type === null) {
      host.reportError(`skip a daemon message with no "type" field`);
      return;
    }

    try {
      handleMessage(type, parsed);
    } catch (error) {
      host.reportError(`handle a "${type}" message: ${describe(error)}`);
    }
  };

  // Decodes across chunks, so a character split between two reads survives.
  const decoder = new TextDecoder();
  let buffered = "";

  return {
    start(): void {
      host.send({ type: "spawn_progress", stage: "starting" });
      host.send({ type: "ready" });
      host.send({ type: "spawn_progress", stage: "ready" });
    },
    receive(chunk: Uint8Array): void {
      buffered += decoder.decode(chunk, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";

      for (const line of lines) {
        handleLine(line);
      }
    },
    stop,
  };
};
