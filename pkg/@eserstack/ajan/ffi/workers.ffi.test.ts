// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The worker threads of the blocking names, against the native library
 * (decision-37, TASK-239). The M0-T2 spike (TASK-175) is the baseline: with 8
 * workers blocked in 1-second calls, timer lateness stayed at the idle level
 * (about 3 ms) and an fs read took about 1 ms.
 *
 * The local HTTP server below runs on this thread. A Go call that waits on it
 * can only get its answer because the call runs in a worker: on the main
 * thread it would hold the event loop the server needs.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as ffi from "./mod.ts";
import type * as types from "./types.ts";

const encoder = new TextEncoder();

/** Records the largest lateness of a 10 ms interval until `stop` runs. */
const watchTimer = (): { readonly stop: () => number } => {
  let last = performance.now();
  let worst = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 10);
    last = now;
  }, 10);

  return {
    stop: () => {
      clearInterval(timer);
      return worst;
    },
  };
};

/** How long a read of a small file takes, in milliseconds. */
const timeSmallRead = async (): Promise<number> => {
  const startedAt = performance.now();
  await runtime.fs.readFile(import.meta.filename);

  return performance.now() - startedAt;
};

/** Waits until the library's workers are idle again, up to `withinMs`. */
const waitIdle = async (
  lib: types.FFILibrary,
  withinMs: number,
): Promise<types.WorkerStats> => {
  const deadline = performance.now() + withinMs;
  let stats = lib.workers();
  while (
    (stats.busy > 0 || stats.readers > 0) &&
    performance.now() < deadline
  ) {
    // Polls the counts until the workers settle.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 10));
    stats = lib.workers();
  }

  return stats;
};

/**
 * A local server that answers like Ollama's /api/chat (the fake AI provider)
 * and serves an HTTP body that stalls after its first chunk.
 */
const startServer = async (): Promise<{
  readonly url: string;
  readonly stop: () => Promise<void>;
}> => {
  const controller = new AbortController();
  const timers = new Set<ReturnType<typeof setInterval>>();

  const server = await runtime.http.serve(
    { port: 0, signal: controller.signal },
    async (request) => {
      const path = new URL(request.url).pathname;

      if (path === "/api/chat") {
        const body = (await request.json()) as {
          readonly model: string;
          readonly stream: boolean;
        };

        // Never answers: the request waits until it is cancelled.
        if (body.model === "stall") {
          return new Response(new ReadableStream({}));
        }

        // A token every 50 ms, without end.
        return new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              const timer = setInterval(() => {
                try {
                  stream.enqueue(
                    encoder.encode(
                      `${JSON.stringify({ message: { content: "tok" }, done: false })}\n`,
                    ),
                  );
                } catch {
                  clearInterval(timer);
                  timers.delete(timer);
                }
              }, 50);
              timers.add(timer);
            },
          }),
          { headers: { "content-type": "application/x-ndjson" } },
        );
      }

      // Answers after one second.
      if (path === "/slow") {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return new Response("slow");
      }

      if (path === "/stall") {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.enqueue(encoder.encode("first"));
            },
          }),
        );
      }

      return new Response("not found", { status: 404 });
    },
  );

  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: async () => {
      for (const timer of timers) {
        clearInterval(timer);
      }
      controller.abort();
      await server.finished;
    },
  };
};

const createModel = (lib: types.FFILibrary, base: string, model: string) => {
  const created = lib.call("aiCreateModel", {
    provider: "ollama",
    model,
    properties: { baseUrl: base },
  });
  assert.assertEquals(created.error, undefined, JSON.stringify(created));

  return created["handle"] as string;
};

const userMessage = {
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
};

nodeTest.test(
  "8 one-second blocking calls leave the timers and fs reads of the main thread on time",
  async () => {
    // httpRequest rather than shellExec: a command forks this whole process,
    // and 8 forks at once on a loaded machine stall it, which would measure
    // fork() rather than the workers.
    const server = await startServer();
    const lib = await ffi.loadEserAjan({ wasm: false });
    try {
      const client = lib.call("httpCreate", { timeoutMs: 30_000 });
      const request = {
        handle: client.handle ?? "",
        url: `${server.url}/slow`,
      };

      // Start the pool, so the measurement covers the calls rather than the
      // workers' start (about 100 to 300 ms of module loading each, off this
      // thread).
      await Promise.all(
        Array.from({ length: 8 }, () =>
          lib.call("httpRequest", { ...request, url: `${server.url}/` }),
        ),
      );

      // The gate runs test files side by side, so one lateness spike from
      // another process can pass the bound once. A round is measured up to
      // three times and the test fails only when every round misses; on the
      // main thread the calls make the timer seconds late in each round.
      const rounds: { lateness: number; readMs: number }[] = [];
      for (let round = 0; round < 3; round++) {
        const watch = watchTimer();
        const startedAt = performance.now();
        const calls = Promise.all(
          Array.from({ length: 8 }, () => lib.call("httpRequest", request)),
        );

        // Rounds run one after another, so each measures 8 calls in flight.
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.assertEquals(lib.workers().busy, 8);
        // oxlint-disable-next-line no-await-in-loop
        const readMs = await timeSmallRead();

        // oxlint-disable-next-line no-await-in-loop
        const answers = await calls;
        const elapsed = performance.now() - startedAt;
        const lateness = watch.stop();

        for (const answer of answers) {
          assert.assertEquals([answer.status, answer.body], [200, "slow"]);
        }
        // The 8 ran side by side, not one after another.
        assert.assertLess(elapsed, 3_000, `the 8 calls took ${elapsed} ms`);

        rounds.push({ lateness, readMs });
        if (lateness < 50 && readMs < 100) {
          break;
        }
      }

      const summary = rounds
        .map((r) => `timer ${r.lateness} ms late, fs read ${r.readMs} ms`)
        .join("; ");
      assert.assert(
        rounds.some((r) => r.lateness < 50 && r.readMs < 100),
        `every round missed the 50 ms timer or 100 ms read bound: ${summary}`,
      );
      lib.call("httpClose", client.handle ?? "");
    } finally {
      lib.close();
      await server.stop();
    }
  },
);

nodeTest.test(
  "with 4 PTY panes and an AI stream open, an fs read completes on time",
  async () => {
    const server = await startServer();
    const lib = await ffi.loadEserAjan({ wasm: false });
    try {
      const panes = Array.from({ length: 4 }, () =>
        lib.stream("shellPtyStream", {
          command: "sleep",
          args: ["30"],
          cols: 80,
          rows: 24,
        }),
      );
      for (const pane of panes) {
        assert.assertEquals(pane.opened.error, undefined);
      }
      // Each pane waits on its child in its own worker.
      const paneReads = panes.map((pane) => pane.read());

      const modelHandle = createModel(lib, server.url, "fake");
      const aiStream = await lib.stream("aiTextStream", {
        modelHandle,
        options: userMessage,
      });
      assert.assertEquals(aiStream.opened.error, undefined);
      const firstEvent = await aiStream.read();
      assert.assertEquals(firstEvent?.["type"], "content_delta");
      const pendingEvent = aiStream.read();

      assert.assertEquals(lib.workers().readers, 5);
      const readMs = await timeSmallRead();
      assert.assertLess(readMs, 100, `the fs read took ${readMs} ms`);

      await pendingEvent;
      aiStream.close();
      for (const pane of panes) {
        pane.close();
      }
      await Promise.allSettled(paneReads);
      lib.call("aiCloseModel", modelHandle);

      const idle = await waitIdle(lib, 2_000);
      assert.assertEquals(idle.readers, 0);
    } finally {
      lib.close();
      await server.stop();
    }
  },
);

nodeTest.test(
  "an abort ends an in-flight AI request and an HTTP stream read with an AbortError",
  async () => {
    const server = await startServer();
    const lib = await ffi.loadEserAjan({ wasm: false });
    try {
      const idle = lib.workers();

      // The AI request: the provider never answers until it is cancelled.
      const modelHandle = createModel(lib, server.url, "stall");
      const aiAbort = new AbortController();
      const generating = lib.call(
        "aiGenerateText",
        { modelHandle, options: userMessage },
        { signal: aiAbort.signal },
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.assertEquals(lib.workers().busy, 1);

      let abortedAt = performance.now();
      aiAbort.abort();
      const aiError = await assert.assertRejects(() => generating);
      const aiMs = performance.now() - abortedAt;
      assert.assertEquals((aiError as Error).name, "AbortError");
      assert.assertLess(aiMs, 1_000, `the AI abort took ${aiMs} ms`);

      // The HTTP stream: the body stalls after its first chunk.
      const client = lib.call("httpCreate", { timeoutMs: 30_000 });
      const httpStream = await lib.stream("httpRequestStream", {
        handle: client.handle ?? "",
        url: `${server.url}/stall`,
      });
      assert.assertEquals(httpStream.opened.status, 200);
      assert.assertEquals((await httpStream.read())?.chunk, btoa("first"));

      const readAbort = new AbortController();
      const reading = httpStream.read({ signal: readAbort.signal });
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.assertEquals(lib.workers().readers, 1);

      abortedAt = performance.now();
      readAbort.abort();
      const readError = await assert.assertRejects(() => reading);
      const readMs = performance.now() - abortedAt;
      assert.assertEquals((readError as Error).name, "AbortError");
      assert.assertLess(readMs, 1_000, `the read abort took ${readMs} ms`);

      // Both Go calls ended, so their workers are idle again within 1 s.
      const after = await waitIdle(lib, 1_000);
      assert.assertEquals(
        { busy: after.busy, readers: after.readers },
        { busy: idle.busy, readers: idle.readers },
      );

      httpStream.close();
      lib.call("httpClose", client.handle ?? "");
      lib.call("aiCloseModel", modelHandle);
    } finally {
      lib.close();
      await server.stop();
    }
  },
);

nodeTest.test(
  "more calls than the pool bound wait for a worker and all complete",
  async () => {
    const lib = await ffi.loadEserAjan({ wasm: false, poolSize: 2 });
    try {
      const watched: number[] = [];
      const watcher = setInterval(() => {
        watched.push(lib.workers().pool);
      }, 5);

      const answers = await Promise.all(
        Array.from({ length: 7 }, (_, index) =>
          lib.call("shellExec", {
            command: "sh",
            args: ["-c", `sleep 0.1; echo ${index}`],
            timeout: "10s",
          }),
        ),
      );
      clearInterval(watcher);

      assert.assertEquals(
        answers.map((answer) => answer.stdout),
        Array.from({ length: 7 }, (_, index) => `${index}\n`),
      );
      const stats = lib.workers();
      assert.assertEquals(stats.poolSize, 2);
      assert.assertEquals(stats.peakPool, 2);
      assert.assertEquals(Math.max(...watched), 2);
      assert.assertEquals(stats.queued, 0);
    } finally {
      lib.close();
    }
  },
);

nodeTest.test(
  "the Log calls run synchronously on the main thread and post no worker message",
  async () => {
    const lib = await ffi.loadEserAjan({ wasm: false });
    try {
      // A blocking call first, so a pool worker exists and could be asked.
      await lib.call("shellExec", { command: "true", timeout: "5s" });
      const before = lib.workers();

      const created = lib.call("logCreate", {
        scopeName: "workers-test",
        level: "error",
      });
      assert.assert(!(created instanceof Promise), "logCreate answered later");
      const handle = created.handle ?? "";

      const allowed = lib.call("logShouldLog", { handle, level: "debug" });
      const written = lib.call("logWrite", {
        handle,
        level: "debug",
        message: "below the level, so nothing prints",
      });
      const configured = lib.call("logConfigure", { handle, level: "error" });
      const closed = lib.call("logClose", handle);

      for (const answer of [allowed, written, configured, closed]) {
        assert.assert(
          !(answer instanceof Promise),
          "a Log call answered later",
        );
      }
      assert.assertEquals(allowed.allowed, false);
      assert.assertEquals(lib.workers().posted, before.posted);
    } finally {
      lib.close();
    }
  },
);
