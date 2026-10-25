// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "../mod.ts";
import * as node from "./node.ts";
import * as httpScenario from "./testdata/http-scenario.ts";
import * as probes from "./testdata/probes.ts";

// The probe tests run scripts in a child process of the Node that runs the
// tests, which loads the TypeScript sources through its type stripping.

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
    crossRuntime.runtime.process.execPath(),
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

nodeTest.test("Node adapter process stdio", async (t) => {
  await t.test(
    "a script that never reads stdin exits while its stdin pipe is open",
    async () => {
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
  );

  await t.test(
    "runtime.process.stdin reads the piped input to its end",
    async () => {
      const result = await runNodeProbe(
        `const { runtime } = await import(process.argv[1]);
        const text = await new Response(runtime.process.stdin).text();
        runtime.process.writeToStdout(new TextEncoder().encode(text.toUpperCase()));`,
        "ping from node",
      );

      assert.assertEquals(result.timedOut, false, result.stderr);
      assert.assertEquals(result.code, 0, result.stderr);
      assert.assertEquals(result.stdout, "PING FROM NODE");
    },
  );
});

nodeTest.test(
  "Node adapter maps EACCES to PermissionDeniedError",
  async (t) => {
    // root reads files regardless of their mode.
    const isRoot = crossRuntime.runtime.env.get("USER") === "root";

    await t.test(
      "reading a file without read permission",
      { skip: isRoot || crossRuntime.getPlatform() === "windows" },
      async () => {
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
    );
  },
);

nodeTest.test("Node adapter runtime.http and signal listeners", async (t) => {
  await t.test("runtime.http meets the HTTP contract", async () => {
    const outcome = await probes.runHttpProbe(probes.PROBE_RUNTIMES.node);

    assert.assertEquals(outcome.timedOut, false, outcome.stderr);
    assert.assertEquals(outcome.code, 0, outcome.stderr);
    assert.assertEquals(
      JSON.parse(outcome.stdout),
      httpScenario.EXPECTED_HTTP_RESULT,
    );
  });

  await t.test(
    "a signal listener runs, then its removal lets the process end",
    { skip: crossRuntime.getPlatform() === "windows" },
    async () => {
      const outcome = await probes.runSignalProbe(probes.PROBE_RUNTIMES.node);

      assert.assertEquals(outcome.timedOut, false, outcome.stderr);
      assert.assertEquals(outcome.stdout, "ready\ngot SIGTERM\n");
      assert.assertEquals(outcome.code, 0, outcome.stderr);
    },
  );
});

nodeTest.test("Node adapter exec stops a process on an abort", async (t) => {
  const runtime = node.createNodeRuntime();
  const sleep = ["-e", "setTimeout(() => {}, 30_000)"];

  await t.test("spawn resolves with a failed result", async () => {
    const controller = new AbortController();
    const pending = runtime.exec.spawn(runtime.process.execPath(), sleep, {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);

    const result = await pending;

    assert.assertEquals(result.success, false);
    assert.assertNotEquals(result.code, 0);
  });

  await t.test("spawn resolves for a signal aborted before it", async () => {
    const result = await runtime.exec.spawn(runtime.process.execPath(), sleep, {
      signal: AbortSignal.abort(),
    });

    assert.assertEquals(result.success, false);
  });

  await t.test("spawnChild status resolves with the signal", async () => {
    const controller = new AbortController();
    const child = runtime.exec.spawnChild(runtime.process.execPath(), sleep, {
      stdout: "null",
      stderr: "null",
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);

    const status = await child.status;

    assert.assertEquals(status.success, false);
    assert.assertEquals(status.signal, "SIGTERM");
  });

  await t.test("spawn still rejects for a missing command", async () => {
    await assert.assertRejects(() =>
      runtime.exec.spawn("nonexistent-binary-eser-xyz-99"),
    );
  });
});

nodeTest.test("Node adapter makeTempDir", async (t) => {
  const runtime = node.createNodeRuntime();

  await t.test("creates the directory inside the temp dir", async () => {
    const parent = await runtime.fs.makeTempDir({ prefix: "standards-" });
    try {
      const dir = await runtime.fs.makeTempDir({ dir: parent });

      assert.assertEquals(runtime.path.dirname(dir), parent);
      assert.assertEquals((await runtime.fs.stat(dir)).isDirectory, true);
    } finally {
      await runtime.fs.remove(parent, { recursive: true });
    }
  });

  await t.test("creates the directory in os.tmpdir by default", async () => {
    const dir = await runtime.fs.makeTempDir();
    try {
      assert.assertEquals(
        runtime.path.dirname(dir),
        runtime.path.resolve(crossRuntime.getTmpdir()),
      );
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  });
});

nodeTest.test("Node adapter statSync", async (t) => {
  const runtime = node.createNodeRuntime();

  await t.test("describes a file", () => {
    const info = runtime.fs.statSync(new URL(import.meta.url).pathname);

    assert.assertEquals(info.isFile, true);
    assert.assertEquals(info.isDirectory, false);
  });

  await t.test("throws NotFoundError for a missing path", () => {
    assert.assertThrows(
      () => runtime.fs.statSync("/nonexistent-path-eser-xyz-99"),
      crossRuntime.NotFoundError,
    );
  });
});

nodeTest.test("Node adapter isStandalone is false outside a SEA", () => {
  assert.assertEquals(node.createNodeRuntime().process.isStandalone, false);
});
