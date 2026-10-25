// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "../mod.ts";
import * as httpScenario from "./testdata/http-scenario.ts";
import * as probes from "./testdata/probes.ts";

// These tests run scripts under a real Node, which loads the TypeScript
// sources through its built-in type stripping (Node 22.18 and later).

const MOD_URL = new URL("../mod.ts", import.meta.url).href;
const PROBE_TIMEOUT_MS = 15_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type ProbeResult = {
  readonly timedOut: boolean;
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

/**
 * Runs `script` as an ES module under Node, with the cross-runtime entry
 * point's URL as `process.argv[1]`. With `input` null the child's stdin stays
 * an open pipe until the child has exited.
 */
const runNodeProbe = async (
  script: string,
  input: string | null,
): Promise<ProbeResult> => {
  const child = crossRuntime.runtime.exec.spawnChild(
    "node",
    ["--input-type=module", "--eval", script, MOD_URL],
    { stdin: "piped", stdout: "piped", stderr: "piped" },
  );

  if (child.stdin === null) {
    throw new Error('spawnChild returned no stdin for stdin: "piped"');
  }

  const writer = child.stdin.getWriter();
  if (input !== null) {
    await writer.write(encoder.encode(input));
    await writer.close();
  }

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

  if (input === null) {
    await writer.close();
  }

  return {
    timedOut: finished === null,
    code: result.code,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
};

Deno.test("Node adapter process stdio", async (t) => {
  // The validate job installs Node; where it is missing the steps are skipped.
  const hasNode = await crossRuntime.isCommandInPath("node");

  await t.step({
    name: "a script that never reads stdin exits while its stdin pipe is open",
    ignore: !hasNode,
    fn: async () => {
      const result = await runNodeProbe(
        `const { runtime } = await import(process.argv[1]);
        const writer = runtime.process.stdout.getWriter();
        await writer.write(new TextEncoder().encode(runtime.name));
        writer.releaseLock();`,
        null,
      );

      assert.assertEquals(
        result.timedOut,
        false,
        `node did not exit within ${PROBE_TIMEOUT_MS} ms with stdin open; stderr: ${result.stderr}`,
      );
      assert.assertEquals(result.code, 0, result.stderr);
      assert.assertEquals(result.stdout, "node");
    },
  });

  await t.step({
    name: "runtime.process.stdin reads the piped input to its end",
    ignore: !hasNode,
    fn: async () => {
      const result = await runNodeProbe(
        `const { runtime } = await import(process.argv[1]);
        const text = await new Response(runtime.process.stdin).text();
        runtime.process.writeToStdout(new TextEncoder().encode(text.toUpperCase()));`,
        "ping from deno",
      );

      assert.assertEquals(result.timedOut, false, result.stderr);
      assert.assertEquals(result.code, 0, result.stderr);
      assert.assertEquals(result.stdout, "PING FROM DENO");
    },
  });
});

Deno.test("Node adapter maps EACCES to PermissionDeniedError", async (t) => {
  const hasNode = await crossRuntime.isCommandInPath("node");
  // root reads files regardless of their mode.
  const isRoot = crossRuntime.runtime.env.get("USER") === "root";

  await t.step({
    name: "reading a file without read permission",
    ignore: !hasNode || isRoot || crossRuntime.getPlatform() === "windows",
    fn: async () => {
      const dir = await crossRuntime.runtime.fs.makeTempDir();
      const file = crossRuntime.runtime.path.join(dir, "locked.txt");
      try {
        await crossRuntime.runtime.fs.writeTextFile(file, "secret");
        await crossRuntime.runtime.fs.chmod(file, 0o000);

        const result = await runNodeProbe(
          `const { runtime, PermissionDeniedError } = await import(process.argv[1]);
          try {
            await runtime.fs.readTextFile(${JSON.stringify(file)});
            console.log("read");
          } catch (error) {
            console.log(JSON.stringify([
              error instanceof PermissionDeniedError,
              error.name,
              error.path,
              error.cause?.code,
            ]));
          }`,
          "",
        );

        assert.assertEquals(result.code, 0, result.stderr);
        assert.assertEquals(JSON.parse(result.stdout), [
          true,
          "PermissionDeniedError",
          file,
          "EACCES",
        ]);
      } finally {
        await crossRuntime.runtime.fs.chmod(file, 0o600);
        await crossRuntime.runtime.fs.remove(dir, { recursive: true });
      }
    },
  });
});

Deno.test("Node adapter runtime.http and signal listeners", async (t) => {
  const hasNode = await crossRuntime.isCommandInPath("node");

  await t.step({
    name: "runtime.http meets the HTTP contract",
    ignore: !hasNode,
    fn: async () => {
      const outcome = await probes.runHttpProbe(probes.PROBE_RUNTIMES.node);

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
    ignore: !hasNode || Deno.build.os === "windows",
    fn: async () => {
      const outcome = await probes.runSignalProbe(probes.PROBE_RUNTIMES.node);

      assert.assertEquals(outcome.timedOut, false, outcome.stderr);
      assert.assertEquals(outcome.stdout, "ready\ngot SIGTERM\n");
      assert.assertEquals(outcome.code, 0, outcome.stderr);
    },
  });
});
