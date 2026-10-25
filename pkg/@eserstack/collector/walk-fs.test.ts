// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as patterns from "@eserstack/standards/patterns";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as collector from "./collector.ts";
import * as ffiClient from "./ffi-client.ts";
import * as walkFs from "./walk-fs.ts";

// Opened before the tests register, so the `ignore` flags know whether the
// bridge loaded.
// deno-lint-ignore no-top-level-await
await ffiClient.ensureLib();
const ffiLib = ffiClient.getLib();

/** A tree that exercises ordering, extensions, skipped dirs and ignores. */
const FIXTURE_FILES = [
  "a.ts",
  "a/b.ts",
  "a/c.TSX",
  "a/d.json",
  "b.mjs",
  "b.test.ts",
  "node_modules/pkg/index.js",
  "dist/out.js",
  "nested/deep/file.cts",
  "nested/testdata/skipped.ts",
  "nested/_private.ts",
  ".hidden.ts",
  "z.d.ts",
];

const withFixture = async (
  run: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "collector-walk-" });
  try {
    for (const file of FIXTURE_FILES) {
      const path = runtime.path.join(dir, file);
      // Sequential: each file's directory is created before it is written.
      // deno-lint-ignore no-await-in-loop
      await runtime.fs.ensureDir(runtime.path.dirname(path));
      // deno-lint-ignore no-await-in-loop
      await runtime.fs.writeTextFile(path, "");
    }
    await run(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

const goWalk = (dir: string, ignore: RegExp): string[] => {
  const raw = ffiLib!.symbols.EserAjanCollectorWalkFiles(
    JSON.stringify({ dir, ignoreFilePattern: ignore.source }),
  );
  const result = JSON.parse(raw) as {
    files?: Array<{ relPath: string }> | null;
  };
  return (result.files ?? []).map((file) => file.relPath);
};

Deno.test("walkCollectableFiles skips excluded dirs, other extensions and ignored files, in Go's order", async () => {
  await withFixture(async (dir) => {
    assert.assertEquals(
      await walkFs.walkCollectableFiles(dir, patterns.JS_TEST_FILE_PATTERN),
      [
        ".hidden.ts",
        "a/b.ts",
        "a/c.TSX",
        "a.ts",
        "b.mjs",
        "nested/_private.ts",
        "nested/deep/file.cts",
        "nested/testdata/skipped.ts",
        "z.d.ts",
      ],
    );
  });
});

Deno.test({
  name: "walkCollectableFiles returns what the Go collector returns",
  ignore: ffiLib === null,
  fn: async () => {
    await withFixture(async (dir) => {
      // Patterns Go's regexp and JavaScript read the same way.
      for (const ignore of [/\.test\./, /(^|\/)_/, /testdata\//, /^$/]) {
        assert.assertEquals(
          // Sequential: one walk at a time keeps the comparison readable.
          // deno-lint-ignore no-await-in-loop
          await walkFs.walkCollectableFiles(dir, ignore),
          goWalk(dir, ignore),
          ignore.source,
        );
      }
    });
  },
});

Deno.test("walkCollectableFiles names a root that cannot be read", async () => {
  const parent = await runtime.fs.makeTempDir({ prefix: "collector-walk-" });
  try {
    const missing = runtime.path.join(parent, "missing");
    const error = await assert.assertRejects(
      () => walkFs.walkCollectableFiles(missing, /^$/),
      walkFs.UnreadableWalkRootError,
    );
    assert.assertStringIncludes(error.message, missing);
  } finally {
    await runtime.fs.remove(parent, { recursive: true });
  }
});

Deno.test({
  name: "walkFiles calls the Go collector when the bridge is loaded",
  ignore: ffiLib === null,
  fn: async () => {
    const original = ffiLib!.symbols.EserAjanCollectorWalkFiles;
    const requests: string[] = [];
    ffiLib!.symbols.EserAjanCollectorWalkFiles = (request: string) => {
      requests.push(request);
      return JSON.stringify({
        files: [{ relPath: "from-go.ts", absPath: "/x/from-go.ts" }],
      });
    };
    try {
      const files = await Array.fromAsync(
        collector.walkFiles("/x", undefined, /^$/),
      );
      assert.assertEquals(files, ["from-go.ts"]);
      assert.assertEquals(requests.length, 1);
    } finally {
      ffiLib!.symbols.EserAjanCollectorWalkFiles = original;
    }
  },
});

Deno.test({
  name: "walkFiles walks in TypeScript when the Go walk reports an error",
  ignore: ffiLib === null,
  fn: async () => {
    const original = ffiLib!.symbols.EserAjanCollectorWalkFiles;
    ffiLib!.symbols.EserAjanCollectorWalkFiles = () =>
      JSON.stringify({ error: "walk root cannot be read" });
    try {
      await withFixture(async (dir) => {
        assert.assertEquals(
          await Array.fromAsync(
            collector.walkFiles(dir, "a/*", patterns.JS_TEST_FILE_PATTERN),
          ),
          ["a/b.ts", "a/c.TSX"],
        );
      });
    } finally {
      ffiLib!.symbols.EserAjanCollectorWalkFiles = original;
    }
  },
});

Deno.test("walkFiles walks in TypeScript with ESER_AJAN=disabled", async () => {
  await withFixture(async (dir) => {
    const script = `
      import * as collector from ${
      JSON.stringify(import.meta.resolve("./collector.ts"))
    };
      const files = await Array.fromAsync(collector.walkFiles(${
      JSON.stringify(dir)
    }, undefined, /\\.test\\./));
      console.log(JSON.stringify(files));
    `;
    const output = await new Deno.Command(Deno.execPath(), {
      args: ["eval", "--quiet", script],
      env: { ESER_AJAN: "disabled" },
      stdout: "piped",
      stderr: "piped",
    }).output();

    assert.assertEquals(
      output.code,
      0,
      new TextDecoder().decode(output.stderr),
    );
    assert.assertEquals(
      JSON.parse(new TextDecoder().decode(output.stdout).trim()),
      await walkFs.walkCollectableFiles(dir, /\.test\./),
    );
  });
});
