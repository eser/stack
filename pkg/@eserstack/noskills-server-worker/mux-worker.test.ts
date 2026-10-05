// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// End-to-end: runs mux-worker.ts as the daemon does, against a stand-in daemon
// listening on a Unix socket.

import * as assert from "@std/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as deps from "./deps.ts";

const WORKER_DIR = import.meta.dirname ?? ".";
const WORKER_PATH = runtime.path.join(WORKER_DIR, "mux-worker.ts");

/** Bounds every wait, so a worker that hangs fails the test instead. */
const WAIT_MS = 15_000;

const runWorker = (args: ReadonlyArray<string>) =>
  runtime.exec.spawnChild(
    runtime.process.execPath(),
    ["run", "--allow-all", WORKER_PATH, ...args],
    { cwd: WORKER_DIR, stdin: "null", stdout: "null", stderr: "piped" },
  );

const withTimeout = <T>(promise: Promise<T>, what: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} took longer than ${WAIT_MS} ms`)),
      WAIT_MS,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/** A daemon stand-in: accepts one connection and reads its JSON lines. */
const startDaemon = async (socketPath: string) => {
  const server = deps.net.createServer();
  const received: unknown[] = [];
  const waiters: Array<{ count: number; resolve: () => void }> = [];
  let buffered = "";

  const connection = new Promise<deps.net.Socket>((resolve) => {
    server.once("connection", (socket: deps.net.Socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        buffered += chunk;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          received.push(JSON.parse(line));
        }
        for (const waiter of waiters) {
          if (received.length >= waiter.count) waiter.resolve();
        }
      });
      resolve(socket);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve());
  });

  return {
    connection,
    received,
    /** Resolves once the worker has sent `count` messages in total. */
    messages: (count: number): Promise<unknown[]> =>
      withTimeout(
        new Promise<void>((resolve) => {
          if (received.length >= count) resolve();
          else waiters.push({ count, resolve });
        }).then(() => received.slice(0, count)),
        `waiting for ${count} worker messages`,
      ),
    close: (): Promise<void> =>
      new Promise((resolve) => server.close(() => resolve())),
  };
};

type Daemon = Awaited<ReturnType<typeof startDaemon>>;
type WorkerOutput = Awaited<ReturnType<ReturnType<typeof runWorker>["output"]>>;

const withSocketDir = async (
  fn: (socketPath: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "mux-worker-" });
  try {
    await fn(runtime.path.join(dir, "daemon.sock"));
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

/**
 * Starts a daemon stand-in and a worker connected to it. The worker is killed
 * afterwards if it is still running, so a failed assertion leaves no process.
 */
const withWorker = async (
  fn: (daemon: Daemon, exited: Promise<WorkerOutput>) => Promise<void>,
): Promise<void> => {
  await withSocketDir(async (socketPath) => {
    const daemon = await startDaemon(socketPath);
    const child = runWorker([socketPath]);
    // Drains stderr from the start, so the worker never blocks on a full pipe.
    const exited = child.output();
    try {
      await fn(daemon, withTimeout(exited, "the worker's exit"));
    } finally {
      try {
        child.kill("SIGKILL");
      } catch {
        // The worker has exited already, which is the expected case.
      }
      await exited;
      await daemon.close();
    }
  });
};

const HANDSHAKE = [
  { type: "spawn_progress", stage: "starting" },
  { type: "ready" },
  { type: "spawn_progress", stage: "ready" },
];

const ATTACH = {
  type: "mux",
  frame: { t: "attach", viewport: { cols: 80, rows: 24 } },
};

Deno.test("mux-worker exits with 1 when it gets no socket path", async () => {
  const output = await withTimeout(runWorker([]).output(), "the worker");

  assert.assertEquals(output.code, 1);
  assert.assertStringIncludes(
    new TextDecoder().decode(output.stderr),
    "missing socket path argument",
  );
});

Deno.test("mux-worker exits with 1 when the socket cannot be reached", async () => {
  await withSocketDir(async (socketPath) => {
    const output = await withTimeout(
      runWorker([socketPath]).output(),
      "the worker",
    );

    assert.assertEquals(output.code, 1);
    assert.assertStringIncludes(
      new TextDecoder().decode(output.stderr),
      "[mux-worker] daemon socket:",
    );
  });
});

Deno.test("mux-worker sends the ready handshake and exits with 0 on shutdown", async () => {
  await withWorker(async (daemon, exited) => {
    assert.assertEquals(await daemon.messages(3), HANDSHAKE);

    const socket = await daemon.connection;
    socket.write(`${JSON.stringify(ATTACH)}\n`);
    const [, , , scene] = await daemon.messages(4);
    assert.assertObjectMatch(scene as Record<string, unknown>, {
      type: "mux",
      v: 1,
      frame: { t: "scene", full: true },
    });

    socket.write(`${JSON.stringify({ type: "shutdown" })}\n`);

    assert.assertEquals((await exited).code, 0);
  });
});

Deno.test("mux-worker exits with 0 when the daemon closes the connection", async () => {
  await withWorker(async (daemon, exited) => {
    await daemon.messages(3);

    (await daemon.connection).end();

    assert.assertEquals((await exited).code, 0);
  });
});
