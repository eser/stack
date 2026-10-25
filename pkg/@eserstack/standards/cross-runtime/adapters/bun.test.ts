// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "../mod.ts";
import * as httpScenario from "./testdata/http-scenario.ts";
import * as probes from "./testdata/probes.ts";

// Smoke tests that run scripts under a real Bun, so the Bun adapter is the one
// cross-runtime detects.

const MOD_URL = new URL("../mod.ts", import.meta.url).href;
const PROBE_TIMEOUT_MS = 15_000;

const decoder = new TextDecoder();

type ProbeResult = {
  readonly timedOut: boolean;
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

/**
 * Runs `script` under Bun, with the cross-runtime entry point's URL as
 * `process.argv[1]`. The child's stdin stays an open pipe until the child has
 * exited.
 */
const runBunProbe = async (script: string): Promise<ProbeResult> => {
  const child = crossRuntime.runtime.exec.spawnChild(
    "bun",
    ["--eval", script, MOD_URL],
    { stdin: "piped", stdout: "piped", stderr: "piped" },
  );

  const output = child.output();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PROBE_TIMEOUT_MS);
  });

  const finished = await Promise.race([output, timeout]);
  clearTimeout(timer);

  if (finished === null) {
    child.kill("SIGKILL");
  }

  const result = await output;
  await child.stdin?.close();

  return {
    timedOut: finished === null,
    code: result.code,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
};

const assertFinished = (result: ProbeResult): void => {
  assert.assertEquals(
    result.timedOut,
    false,
    `bun did not exit within ${PROBE_TIMEOUT_MS} ms; stderr: ${result.stderr}`,
  );
  assert.assertEquals(result.code, 0, result.stderr);
};

Deno.test("Bun adapter smoke test", async (t) => {
  // The validate job does not install Bun; where it is missing the steps are
  // skipped, and they run on any machine that has it.
  const hasBun = await crossRuntime.isCommandInPath("bun");

  await t.step({
    name: "a script that never reads stdin exits while its stdin pipe is open",
    ignore: !hasBun,
    fn: async () => {
      const result = await runBunProbe(
        `const { runtime } = await import(process.argv[1]);
        const writer = runtime.process.stdout.getWriter();
        await writer.write(new TextEncoder().encode(runtime.name));
        writer.releaseLock();`,
      );

      assertFinished(result);
      assert.assertEquals(result.stdout, "bun");
    },
  });

  await t.step({
    name: "spawnChild stdin takes writes through getWriter",
    ignore: !hasBun,
    fn: async () => {
      const result = await runBunProbe(
        `const { runtime } = await import(process.argv[1]);
        const child = runtime.exec.spawnChild(
          runtime.process.execPath(),
          ["--eval", "process.stdin.pipe(process.stdout)"],
          { stdin: "piped", stdout: "piped", stderr: "piped" },
        );
        const writer = child.stdin.getWriter();
        await writer.write(new TextEncoder().encode("written to "));
        await writer.write(new TextEncoder().encode("child stdin"));
        await writer.close();
        const output = await child.output();
        runtime.process.writeToStdout(output.stdout);`,
      );

      assertFinished(result);
      assert.assertEquals(result.stdout, "written to child stdin");
    },
  });

  await t.step({
    name: "spawn adds options.env to the inherited environment",
    ignore: !hasBun,
    fn: async () => {
      const result = await runBunProbe(
        `const { runtime } = await import(process.argv[1]);
        const child = await runtime.exec.spawn(
          runtime.process.execPath(),
          ["--eval", "process.stdout.write(JSON.stringify([" +
            "process.env.PATH !== undefined, process.env.PROBE_VAR ?? null]))"],
          { env: { PROBE_VAR: "set" } },
        );
        runtime.process.writeToStdout(child.stdout);`,
      );

      assertFinished(result);
      assert.assertEquals(JSON.parse(result.stdout), [true, "set"]);
    },
  });

  await t.step({
    name: "spawnChild stops the child when its abort signal fires",
    ignore: !hasBun,
    fn: async () => {
      const result = await runBunProbe(
        `const { runtime } = await import(process.argv[1]);
        const controller = new AbortController();
        const child = runtime.exec.spawnChild(
          runtime.process.execPath(),
          ["--eval", "setTimeout(() => {}, 30000)"],
          { signal: controller.signal },
        );
        controller.abort();
        const status = await child.status;
        runtime.process.writeToStdout(
          new TextEncoder().encode(JSON.stringify(status)),
        );`,
      );

      assertFinished(result);
      const status = JSON.parse(result.stdout);
      assert.assertEquals(status.success, false);
      assert.assertEquals(status.signal, "SIGTERM");
    },
  });
});

Deno.test("Bun adapter runtime.http and signal listeners", async (t) => {
  const hasBun = await crossRuntime.isCommandInPath("bun");

  await t.step({
    name: "runtime.http meets the HTTP contract",
    ignore: !hasBun,
    fn: async () => {
      const outcome = await probes.runHttpProbe(probes.PROBE_RUNTIMES.bun);

      assert.assertEquals(outcome.timedOut, false, outcome.stderr);
      assert.assertEquals(outcome.code, 0, outcome.stderr);
      assert.assertEquals(
        JSON.parse(outcome.stdout),
        httpScenario.EXPECTED_HTTP_RESULT,
      );
    },
  });

  await t.step({
    name: "a signal listener runs, then its removal lets the process end",
    // Windows delivers only SIGINT and SIGBREAK.
    ignore: !hasBun || Deno.build.os === "windows",
    fn: async () => {
      const outcome = await probes.runSignalProbe(probes.PROBE_RUNTIMES.bun);

      assert.assertEquals(outcome.timedOut, false, outcome.stderr);
      assert.assertEquals(outcome.stdout, "ready\ngot SIGTERM\n");
      assert.assertEquals(outcome.code, 0, outcome.stderr);
    },
  });
});
