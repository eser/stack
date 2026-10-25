// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as path from "@std/path";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as ffiClient from "./ffi-client.ts";
import * as validateNamingAndTodos from "./validate-naming-and-todos.ts";

// The check runs in Go, so these tests need the native library.
// oxlint-disable-next-line node/no-top-level-await
await ffiClient.ensureLib();
const withoutFfi = ffiClient.getLib() === null;

const withFixture = async (
  files: Record<string, string>,
  run: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await crossRuntime.runtime.fs.makeTempDir({
    prefix: "validate-naming-and-todos-",
  });
  try {
    for (const [name, content] of Object.entries(files)) {
      // Sequential: a handful of small fixture files.
      // oxlint-disable-next-line no-await-in-loop
      await crossRuntime.runtime.fs.writeTextFile(
        path.join(dir, name),
        content,
      );
    }
    await run(dir);
  } finally {
    await crossRuntime.runtime.fs.remove(dir, { recursive: true });
  }
};

// sanitizeResources: false — the FFI DynamicLibrary singleton persists for the
// process lifetime.
nodeTest.test(
  "validate-naming-and-todos fails a fixture with an untagged TODO comment",
  { skip: withoutFfi },
  async () => {
    await withFixture(
      {
        "untagged.ts": "// TODO: handle the empty case\nexport const x = 1;\n",
        "tagged.ts":
          "// TODO(TASK-12): handle the empty case\nexport const y = 1;\n",
        "literal.ts": 'export const prompt = "TODO list";\n',
      },
      async (dir) => {
        const result = await validateNamingAndTodos.validator.validate({
          root: dir,
        });

        assert.assertEquals(result.passed, false);
        assert.assertEquals(result.issues.length, 1);
        assert.assertStringIncludes(result.issues[0]!.message, "TODO");
        assert.assertStringIncludes(
          result.issues[0]!.file ?? "",
          "untagged.ts",
        );
      },
    );
  },
);

nodeTest.test(
  "validate-naming-and-todos run() reports a snake_case declaration",
  { skip: withoutFfi },
  async () => {
    await withFixture(
      {
        "names.ts": "export const user_id = 1;\nexport const userName = 2;\n",
      },
      async (dir) => {
        const result = await validateNamingAndTodos.run({ root: dir });

        assert.assertEquals(result.issues.length, 1);
        assert.assertEquals(result.issues[0]!.line, 1);
        assert.assertStringIncludes(result.issues[0]!.message, "user_id");
      },
    );
  },
);

nodeTest.test(
  "validate-naming-and-todos accepts names listed in allowNames",
  { skip: withoutFfi },
  async () => {
    await withFixture(
      {
        "names.ts": 'export const grant_type = "code";\n',
      },
      async (dir) => {
        const result = await validateNamingAndTodos.validator.validate({
          root: dir,
          options: { allowNames: ["grant_type"] },
        });

        assert.assertEquals(result.passed, true);
      },
    );
  },
);
