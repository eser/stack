// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bun runtime adapter.
 * Composes node-shared (fs, path, env, process) with Bun-specific
 * spawn/spawnChild via Bun.spawn and serve via Bun.serve.
 *
 * @module
 */

import type {
  ChildProcess,
  HttpHandler,
  HttpServer,
  ProcessOutput,
  ProcessStatus,
  Runtime,
  RuntimeCapabilities,
  RuntimeHttp,
  ServeOptions,
  SpawnOptions,
  WebSocketUpgrade,
} from "../types.ts";
import * as shared from "./shared.ts";
import * as nodeShared from "./node-shared.ts";
import * as serverWebSocket from "./server-websocket.ts";
import * as webStreams from "./web-streams.ts";

/**
 * Bun capabilities - full capabilities, no native KV.
 */
export const BUN_CAPABILITIES: RuntimeCapabilities = {
  fs: true,
  fsSync: true,
  exec: true,
  process: true,
  env: true,
  stdin: true,
  stdout: true,
  http: true,
  kv: false,
} as const;

/** The part of Bun's ServerWebSocket that the adapter calls. */
type BunSocket = {
  readonly data: BunSocketBinding;
  send(data: string | Uint8Array): number;
  close(code?: number, reason?: string): void;
  getBufferedAmount(): number;
};

/** The part of the server Bun.serve returns that the adapter calls. */
type BunServer = {
  readonly hostname: string;
  readonly port: number;
  upgrade(request: Request, options: { data: BunSocketBinding }): boolean;
  stop(closeActiveConnections?: boolean): Promise<void>;
};

// Bun global type
declare const Bun: {
  version: string;
  serve: (options: {
    port: number;
    hostname: string;
    development: boolean;
    fetch: (
      request: Request,
      server: BunServer,
    ) => Promise<Response | undefined>;
    websocket: {
      open: (ws: BunSocket) => void;
      message: (ws: BunSocket, message: string | Uint8Array) => void;
      drain: (ws: BunSocket) => void;
      close: (ws: BunSocket, code: number, reason: string) => void;
    };
  }) => BunServer;
  spawn: (
    cmd: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      stdin?: "inherit" | "pipe" | "ignore" | null;
      stdout?: "inherit" | "pipe" | "ignore" | null;
      stderr?: "inherit" | "pipe" | "ignore" | null;
      signal?: AbortSignal;
    },
  ) => {
    pid: number;
    exited: Promise<number>;
    // The signal that ended the process, set once `exited` resolves.
    signalCode: string | null;
    // Bun sets a stream only for a "pipe" mode; for "inherit" and "ignore" the
    // property is undefined, not null. A piped stdin is a FileSink, not a
    // WritableStream.
    stdin: webStreams.FileSinkLike | undefined;
    stdout: ReadableStream<Uint8Array> | undefined;
    stderr: ReadableStream<Uint8Array> | undefined;
    kill: (signal?: number | string) => void;
  };
};

// =============================================================================
// Bun-specific Spawn
// =============================================================================

// Bun.spawn replaces the whole environment with `env`, while Deno and the Node
// adapter add the given variables to the inherited ones. Merging here keeps
// SpawnOptions.env meaning the same on every runtime.
const mergeEnv = (
  env: Record<string, string> | undefined,
): Record<string, string> | undefined =>
  env !== undefined
    ? { ...nodeShared.createNodeCompatEnv().toObject(), ...env }
    : undefined;

const readStream = async (
  stream: ReadableStream<Uint8Array> | undefined,
): Promise<Uint8Array> => {
  if (stream === undefined) return new Uint8Array(0);

  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      // A stream reader hands out chunks one at a time, in order.
      // deno-lint-ignore no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

const bunSpawn = async (
  cmd: string,
  args?: string[],
  options?: SpawnOptions,
): Promise<ProcessOutput> => {
  const [stdinMode, stdoutMode, stderrMode] = shared.getNodeStdioArray(
    options,
  );
  const proc = Bun.spawn([cmd, ...(args ?? [])], {
    cwd: options?.cwd,
    env: mergeEnv(options?.env),
    // Bun accepts a buffer directly as stdin, so there is no pipe to manage.
    // The cast is needed because the shared stdio typing describes only the
    // three mode strings the other runtimes use.
    stdin: (options?.stdinText === undefined
      ? stdinMode
      : new TextEncoder().encode(options.stdinText)) as typeof stdinMode,
    stdout: stdoutMode,
    stderr: stderrMode,
    signal: options?.signal,
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    readStream(proc.stdout),
    readStream(proc.stderr),
  ]);

  return {
    success: exitCode === 0,
    code: exitCode,
    stdout,
    stderr,
  };
};

const bunSpawnChild = (
  cmd: string,
  args?: string[],
  options?: SpawnOptions,
): ChildProcess => {
  const [stdinMode, stdoutMode, stderrMode] = shared.getNodeStdioArray(
    options,
  );
  const proc = Bun.spawn([cmd, ...(args ?? [])], {
    cwd: options?.cwd,
    env: mergeEnv(options?.env),
    stdin: stdinMode,
    stdout: stdoutMode,
    stderr: stderrMode,
    signal: options?.signal,
  });

  const statusPromise = proc.exited.then(
    (code): ProcessStatus => ({
      success: code === 0,
      code,
      signal: proc.signalCode ?? undefined,
    }),
  );

  return {
    pid: proc.pid,
    stdin: proc.stdin !== undefined
      ? webStreams.createFileSinkWritable(proc.stdin)
      : null,
    stdout: proc.stdout ?? null,
    stderr: proc.stderr ?? null,
    status: statusPromise,
    output: async (): Promise<ProcessOutput> => {
      const [status, stdout, stderr] = await Promise.all([
        statusPromise,
        readStream(proc.stdout),
        readStream(proc.stderr),
      ]);
      return {
        success: status.success,
        code: status.code,
        stdout,
        stderr,
      };
    },
    kill: (signal?: string): void => {
      proc.kill(signal);
    },
  };
};

// =============================================================================
// Bun-specific HTTP
// =============================================================================

/**
 * Ties a Bun server socket to the {@link serverWebSocket.ServerWebSocket} the
 * handler holds. Bun passes it back as `ws.data` in every websocket callback.
 */
type BunSocketBinding = {
  readonly events: serverWebSocket.WebSocketEvents;
  /** Gives the wire the Bun socket once the connection opens. */
  readonly attach: (ws: BunSocket) => void;
};

/** An upgrade the handler accepted, waiting for the handler to return. */
type BunUpgrade = {
  readonly response: Response;
  readonly binding: BunSocketBinding;
};

const createBunHttp = (): RuntimeHttp => {
  // Requests whose handler is running, so that upgradeWebSocket can record an
  // accepted handshake for the fetch callback that received the request.
  const upgrades = new WeakMap<Request, { accepted: BunUpgrade | null }>();

  const serve = (
    options: ServeOptions,
    handler: HttpHandler,
  ): Promise<HttpServer> =>
    // Bun.serve binds before it returns and throws when it cannot; inside the
    // executor that throw rejects the promise.
    new Promise((resolve) => {
      const respond = shared.createSafeHandler(handler);
      const finished = Promise.withResolvers<void>();

      const server = Bun.serve({
        port: options.port,
        hostname: options.hostname ?? shared.DEFAULT_SERVE_HOSTNAME,
        // Development mode answers errors with a page that shows the stack.
        development: false,

        fetch: async (request, bunServer) => {
          const context: { accepted: BunUpgrade | null } = { accepted: null };
          upgrades.set(request, context);

          let response: Response;
          try {
            response = await respond(request);
          } finally {
            upgrades.delete(request);
          }

          const accepted = context.accepted;
          if (accepted !== null && accepted.response === response) {
            // Bun opens the socket inside upgrade(), after the handler has
            // added its listeners. Returning nothing completes the handshake.
            if (bunServer.upgrade(request, { data: accepted.binding })) {
              return undefined;
            }

            accepted.binding.events.closed(1006, "", false);

            return new Response("WebSocket upgrade failed", { status: 400 });
          }

          // The handler accepted the handshake but answered with another
          // response, so the socket never opens.
          accepted?.binding.events.closed(1006, "", false);

          return response;
        },

        websocket: {
          open: (ws) => {
            ws.data.attach(ws);
            ws.data.events.opened();
          },
          message: (ws, message) => ws.data.events.received(message),
          drain: (ws) => ws.data.events.drained(),
          close: (ws, code, reason) =>
            ws.data.events.closed(code, reason, code !== 1006),
        },
      });

      const stop = (): void => {
        // stop(true) closes the listener and every connection, WebSockets
        // included, before it returns, so the server has stopped here. Its
        // promise is not waited for: in Bun 1.3 it never settles once the
        // server has closed a WebSocket itself.
        server.stop(true).catch((error: unknown) => {
          shared.reportServeError("stopping the server failed.", error);
        });
        finished.resolve();
      };

      if (options.signal?.aborted === true) {
        stop();
      } else {
        options.signal?.addEventListener("abort", stop, { once: true });
      }

      resolve({
        hostname: server.hostname,
        port: server.port,
        finished: finished.promise,
      });
    });

  const upgradeWebSocket = (request: Request): WebSocketUpgrade => {
    serverWebSocket.readHandshakeKey(request);
    const context = upgrades.get(request);
    if (context === undefined) {
      throw new TypeError(
        "runtime.http.upgradeWebSocket: the request did not come from runtime.http.serve; pass the Request the serve handler received, not a copy, before the handler returns",
      );
    }

    if (context.accepted !== null) {
      throw new TypeError(
        "runtime.http.upgradeWebSocket: the request was already upgraded; call it once per request",
      );
    }

    let target: BunSocket | null = null;
    const { socket, events } = serverWebSocket.ServerWebSocket.create(
      serverWebSocket.toSocketUrl(request.url),
      {
        // The socket sends and closes only once open, and open attaches the
        // target first.
        send: (data) => {
          target?.send(data);

          return target?.getBufferedAmount() ?? 0;
        },
        close: (code, reason) => target?.close(code ?? undefined, reason),
      },
    );

    // Bun completes the handshake itself; the fetch callback recognizes this
    // response and calls upgrade() instead of sending it.
    const response = new Response(null, { status: 101 });
    context.accepted = {
      response,
      binding: {
        events,
        attach: (ws) => {
          target = ws;
        },
      },
    };

    return { socket, response };
  };

  return { serve, upgradeWebSocket };
};

// =============================================================================
// Runtime Factory
// =============================================================================

/**
 * Creates a Bun runtime instance.
 * Composes: node-shared (fs, path, env, process) + shared exec (exec, execJson)
 * + Bun-specific spawn/spawnChild via Bun.spawn and serve via Bun.serve.
 */
export const createBunRuntime = (): Runtime => ({
  name: "bun",
  version: Bun.version,
  capabilities: BUN_CAPABILITIES as RuntimeCapabilities,
  fs: nodeShared.createNodeCompatFs(),
  path: nodeShared.createNodeCompatPath(),
  exec: shared.createSharedExec(bunSpawn, bunSpawnChild),
  env: nodeShared.createNodeCompatEnv(),
  process: nodeShared.createNodeCompatProcess(),
  http: createBunHttp(),
});
