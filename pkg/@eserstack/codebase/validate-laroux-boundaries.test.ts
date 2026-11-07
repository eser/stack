// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as ffiClient from "./ffi-client.ts";
import * as registry from "./validation/registry.ts";
import * as validateLarouxBoundaries from "./validate-laroux-boundaries.ts";

// The check runs in Go, so these tests need the native library. The rules have
// their fixtures in pkg/ajan/codebasefx/laroux_boundaries_test.go; these cover
// the way from TypeScript to them.
// oxlint-disable-next-line node/no-top-level-await
await ffiClient.ensureLib();
const withoutFfi = ffiClient.getLib() === null;

const { runtime } = crossRuntime;

const withFixture = async (
  files: Record<string, string>,
  run: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({
    prefix: "validate-laroux-boundaries-",
  });
  try {
    for (const [name, content] of Object.entries(files)) {
      const path = runtime.path.join(dir, name);
      // Sequential: a handful of small fixture files.
      // oxlint-disable-next-line no-await-in-loop
      await runtime.fs.ensureDir(runtime.path.dirname(path));
      // oxlint-disable-next-line no-await-in-loop
      await runtime.fs.writeTextFile(path, content);
    }
    await run(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

nodeTest.test(
  "validate-laroux-boundaries reports a forbidden import with its place",
  { skip: withoutFfi },
  async () => {
    await withFixture(
      {
        "a.ts": 'export {};\nimport * as query from "@tanstack/react-query";\n',
        "b.ts": 'export const text = "@tanstack/react-query";\n',
      },
      async (dir) => {
        const result = await validateLarouxBoundaries.checkLarouxBoundaries({
          root: dir,
        });

        assert.assertEquals(result.filesChecked, 2);
        assert.assertEquals(result.issues.length, 1);
        assert.assertEquals(result.issues[0]!.file, "a.ts");
        assert.assertEquals(result.issues[0]!.line, 2);
        assert.assertStringIncludes(
          result.issues[0]!.message,
          "@tanstack/react-query",
        );
      },
    );
  },
);

nodeTest.test(
  "validate-laroux-boundaries runs in the workflow tools and fails a stale entry",
  { skip: withoutFfi },
  async () => {
    await withFixture(
      {
        "a.ts": "export const a = 1;\n",
        "allowlist.json": JSON.stringify({
          "@eserstack/laroux-react": ["a.ts"],
        }),
      },
      async (dir) => {
        const tool = registry
          .getWorkflowTools()
          .find((entry) => entry.name === "validate-laroux-boundaries");

        const result = await tool!.run({
          root: dir,
          allowlist: "allowlist.json",
        });

        assert.assertEquals(result.passed, false);
        assert.assertEquals(result.issues.length, 1);
        assert.assertEquals(result.issues[0]!.path, "a.ts");
        assert.assertStringIncludes(
          result.issues[0]!.message,
          "stale allowlist entry",
        );
      },
    );
  },
);
