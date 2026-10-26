// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Process teardown with the Go library loaded and its workers running
 * (decision-37, TASK-239).
 *
 * Each run is a child process that loads the native library, starts pool and
 * reader workers, runs blocking calls and leaves a PTY read blocked in Go,
 * whose child would sleep for 30 s. Even runs close the library (which runs
 * the PTY's cancel entry and ends every worker) and exit naturally. Odd runs
 * leave it open and call `runtime.process.exit(0)` with the read in flight,
 * the way the CLI entry points exit: the library's exit hook runs the cancel
 * entry, or the exit would wait for the 30 s child.
 *
 * It also checks pin_image (RTLD_NODELETE, pin_image_posix.go): closing the
 * library closes the main thread's handle first, so the last handle goes away
 * in a worker's teardown. The M0-T2 spike (TASK-175) saw that case hang in an
 * unkillable spin on macOS without the pin, because Node unmapped the Go image
 * under its own threads; a hang here fails the run at its timeout.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

const RUNS = 50;
const AT_ONCE = 5;
const RUN_TIMEOUT_MS = 20_000;

const MOD_URL = new URL("./mod.ts", import.meta.url).href;
const RUNTIME_URL = import.meta.resolve("@eserstack/standards/cross-runtime");

/** The child: load, start workers, run blocking calls, close, exit. */
const childScript = (hardExit: boolean): string =>
  [
    `import * as ffi from ${JSON.stringify(MOD_URL)};`,
    `import { runtime } from ${JSON.stringify(RUNTIME_URL)};`,
    `const lib = await ffi.loadEserAjan({ wasm: false, poolSize: 4 });`,
    // Pool workers, each running a blocking call.
    `const answers = await Promise.all([0, 1, 2, 3].map(() =>`,
    `  lib.call("shellExec", { command: "true", timeout: "5s" })));`,
    // A reader worker that reads its stream to the end.
    `const exec = lib.stream("shellExecStream", { command: "sh", args: ["-c", "echo out"] });`,
    `while ((await exec.read()) !== null) {}`,
    `exec.close();`,
    // A reader worker whose read is still blocked in Go when the library closes.
    `const pty = lib.stream("shellPtyStream", { command: "sleep", args: ["30"] });`,
    `const blocked = pty.read().then(() => "returned", (error) => error.message);`,
    `const busy = lib.workers();`,
    `const ok = answers.every((a) => a.code === 0);`,
    ...(hardExit
      ? [
          `console.log(JSON.stringify({ ok, busy, read: "in flight" }));`,
          `runtime.process.exit(0);`,
        ]
      : [
          `lib.close();`,
          `const read = await blocked;`,
          `console.log(JSON.stringify({ ok, busy, read }));`,
        ]),
  ].join("\n");

interface Run {
  readonly index: number;
  readonly code: number;
  readonly signal: string | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly ms: number;
}

const runChild = async (index: number): Promise<Run> => {
  const startedAt = performance.now();
  const child = runtime.exec.spawnChild(
    runtime.process.execPath(),
    ["--input-type=module", "--eval", childScript(index % 2 === 1)],
    {
      stdout: "piped",
      stderr: "piped",
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    },
  );
  const [output, status] = await Promise.all([child.output(), child.status]);
  const decoder = new TextDecoder();

  return {
    index,
    code: status.code,
    signal: status.signal,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
    ms: performance.now() - startedAt,
  };
};

nodeTest.test(
  `${RUNS} runs of load, workers, blocking calls, close and exit all exit with 0 and no signal`,
  { timeout: 240_000 },
  async () => {
    const runs: Run[] = [];
    for (let batch = 0; batch < RUNS; batch += AT_ONCE) {
      // Batches run one after another, so the runs do not crowd the machine.
      // oxlint-disable-next-line no-await-in-loop
      const done = await Promise.all(
        Array.from({ length: AT_ONCE }, (_, offset) =>
          runChild(batch + offset),
        ),
      );
      runs.push(...done);
    }

    for (const run of runs) {
      const context = `run ${run.index} (${Math.round(run.ms)} ms): ${run.stdout}\n${run.stderr}`;

      assert.assertEquals(run.signal, undefined, context);
      assert.assertEquals(run.code, 0, context);
      assert.assertFalse(
        /fatal error|SIGSEGV|SIGBUS|panic:/.test(run.stderr),
        context,
      );

      const report = JSON.parse(run.stdout.trim()) as {
        readonly ok: boolean;
        readonly busy: { readonly pool: number; readonly readers: number };
        readonly read: string;
      };
      assert.assertEquals(report.ok, true, context);
      assert.assertEquals(report.busy.pool, 4, context);
      // The PTY's reader, and the exec stream's while its worker winds down.
      assert.assert(report.busy.readers >= 1, context);
      if (run.index % 2 === 0) {
        // The close ran the PTY's cancel entry, so the worker could end, and
        // the read that was in flight failed with the close.
        assert.assertStringIncludes(report.read, "library was closed", context);
      }
      // Well inside the 30 s the blocked child would have taken.
      assert.assertLess(run.ms, 10_000, context);
    }
  },
);
