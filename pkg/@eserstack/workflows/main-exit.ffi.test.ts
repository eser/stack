// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The CLI exits naturally, with its exit code, after shell steps that ran
 * through the native library.
 *
 * main.ts used to hard-exit, because the Go library could crash Deno on
 * teardown and lose the exit code. Under Node it does not (TASK-175,
 * measurement (c)), and the shell tool's commands run in the library's worker
 * threads, which end with the process. This test fails if a natural exit
 * stops committing the code or the process stays alive.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

const MAIN = runtime.path.join(import.meta.dirname, "main.ts");
const RUNS = 10;

const MANIFEST = [
  "workflows:",
  "  - id: pass",
  "    on: [check]",
  "    steps:",
  "      - shell:",
  "          name: pass",
  '          command: "true"',
  "  - id: fail",
  "    on: [check]",
  "    steps:",
  "      - shell:",
  "          name: pass",
  '          command: "true"',
  "      - shell:",
  "          name: fail",
  '          command: "exit 3"',
  "",
].join("\n");

nodeTest.test(
  "workflows run exits on its own with the workflow's exit code",
  { timeout: 120_000 },
  async () => {
    const dir = await runtime.fs.makeTempDir({ prefix: "workflows-exit-" });
    try {
      await runtime.fs.mkdir(runtime.path.join(dir, ".eser"));
      await runtime.fs.writeTextFile(
        runtime.path.join(dir, ".eser", "manifest.yml"),
        MANIFEST,
      );

      for (let index = 0; index < RUNS; index += 1) {
        const workflow = index % 2 === 0 ? "pass" : "fail";
        const startedAt = performance.now();
        const child = runtime.exec.spawnChild(
          runtime.process.execPath(),
          [MAIN, "run", "-w", workflow],
          {
            cwd: dir,
            stdout: "piped",
            stderr: "piped",
            signal: AbortSignal.timeout(30_000),
          },
        );
        // Each run starts after the last one ended.
        // oxlint-disable-next-line no-await-in-loop
        const [output, status] = await Promise.all([
          child.output(),
          child.status,
        ]);
        const ms = performance.now() - startedAt;
        const context = `run ${index} (${workflow}, ${Math.round(ms)} ms): ${new TextDecoder().decode(output.stdout)}${new TextDecoder().decode(output.stderr)}`;

        assert.assertEquals(status.signal, undefined, context);
        assert.assertEquals(status.code, workflow === "pass" ? 0 : 1, context);
        assert.assertLess(ms, 15_000, context);
      }
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  },
);
