// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A manifest step names `native-function` or `go-workflow` and `eser workflows
 * run` runs it on the native library (ADR 0011, TASK-393).
 *
 * `@eserstack/workflows` defines the two tools and the CLI wires them, so this
 * runs the real entry point on a manifest, the way a user does.
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

const BIN = runtime.path.join(import.meta.dirname, "bin.ts");

const MANIFEST = [
  "workflows:",
  "  - id: check",
  "    on: [check]",
  "    steps:",
  "      - native-function:",
  "          function: validate-eof",
  "      - go-workflow:",
  "          workflow: inner",
  '          manifest: "workflows:\\n  - id: inner\\n    on: [inner]\\n    steps:\\n      - validate-eof\\n"',
  "",
].join("\n");

const run = async (
  dir: string,
  args: readonly string[],
): Promise<{ readonly code: number | undefined; readonly text: string }> => {
  const child = runtime.exec.spawnChild(
    runtime.process.execPath(),
    [BIN, ...args],
    {
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
      signal: AbortSignal.timeout(60_000),
    },
  );
  const [output, status] = await Promise.all([child.output(), child.status]);
  const decoder = new TextDecoder();

  return {
    code: status.code,
    text: `${decoder.decode(output.stdout)}${decoder.decode(output.stderr)}`,
  };
};

const withTree = async (
  files: Readonly<Record<string, string>>,
  body: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "cli-native-tools-" });

  try {
    await runtime.fs.mkdir(runtime.path.join(dir, ".eser"));
    await runtime.fs.writeTextFile(
      runtime.path.join(dir, ".eser", "manifest.yml"),
      MANIFEST,
    );

    for (const [name, content] of Object.entries(files)) {
      // Files are written one after another into the same tree.
      // oxlint-disable-next-line no-await-in-loop
      await runtime.fs.writeTextFile(runtime.path.join(dir, name), content);
    }

    await body(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

nodeTest.test(
  "workflows run runs a native function and a Go workflow named by manifest steps",
  { timeout: 120_000 },
  async () => {
    await withTree({ "a.txt": "no newline at the end" }, async (dir) => {
      const { code, text } = await run(dir, [
        "workflows",
        "run",
        "-w",
        "check",
      ]);

      // Both steps found the file the same way, and the run failed with them.
      assert.assertEquals(code, 1, text);
      assert.assertStringIncludes(
        text,
        "a.txt: file does not end with a newline",
      );
      assert.assertStringIncludes(text, "[validate-eof]");
      assert.assertEquals(text.includes("Unknown tool"), false, text);
    });
  },
);

nodeTest.test(
  "workflows run passes when the tree has no problem for the Go validators",
  { timeout: 120_000 },
  async () => {
    await withTree({ "a.txt": "fine\n" }, async (dir) => {
      const { code, text } = await run(dir, [
        "workflows",
        "run",
        "-w",
        "check",
      ]);

      assert.assertEquals(code, 0, text);
    });
  },
);

nodeTest.test(
  "workflows list shows the two tools",
  { timeout: 120_000 },
  async () => {
    await withTree({}, async (dir) => {
      const { code, text } = await run(dir, ["workflows", "list"]);

      assert.assertEquals(code, 0, text);
      assert.assertStringIncludes(text, "native-function");
      assert.assertStringIncludes(text, "go-workflow");
    });
  },
);
