// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as runtimeJsApis from "./validate-runtime-js-apis.ts";

// The check runs in Go (codebasefx.ValidateRuntimeJSAPIs, whose table-driven
// tests cover every rule), so these tests need the native library and check
// what reaches the TypeScript side through the bridge.

const withFixture = async (
  files: Record<string, string>,
  fn: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await runtime.fs.makeTempDir({
    prefix: "validate-runtime-js-apis-test-",
  });
  try {
    for (const [relPath, content] of Object.entries(files)) {
      const file = runtime.path.join(root, relPath);
      // Sequential: a handful of small fixture files.
      // oxlint-disable-next-line no-await-in-loop
      await runtime.fs.mkdir(runtime.path.dirname(file), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop
      await runtime.fs.writeTextFile(file, content);
    }
    await fn(root);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
};

/** "<file>:<line>:<what was found>" for each issue, sorted. */
const found = (
  issues: readonly {
    readonly path: string;
    readonly line?: number;
    readonly message: string;
  }[],
): string[] =>
  issues
    .map((issue) => {
      const what = issue.message.split("API usage: ")[1]?.split(";")[0];
      return `${runtime.path.basename(issue.path)}:${issue.line}:${what}`;
    })
    .sort();

nodeTest.test(
  "validate-runtime-js-apis: reports Deno and Bun identifiers and process members in code",
  () =>
    withFixture(
      {
        "deno.ts": "const text = await Deno.readTextFile(file);\n",
        "global.ts": "const deno = globalThis.Deno;\n",
        "bun.ts": 'const child = Bun.spawn(["ls"]);\n',
        "alias.ts": "const g = globalThis as any;\nconst b = g.Bun;\n",
        "lib.test.ts": 'Deno.test("x", () => {});\n',
        "node.ts": "const token = process.env.TOKEN;\n",
      },
      async (root) => {
        const result = await runtimeJsApis.run({ root });

        assert.assertEquals(found(result.issues), [
          "alias.ts:2:g.Bun",
          "bun.ts:1:Bun.spawn",
          "deno.ts:1:Deno.readTextFile",
          "global.ts:1:globalThis.Deno",
          "lib.test.ts:1:Deno.test",
          "node.ts:1:process.env",
        ]);
      },
    ),
);

nodeTest.test(
  "validate-runtime-js-apis: text in strings and comments does not count",
  () =>
    withFixture(
      {
        "config.ts": [
          'export const CONFIG_FILE = "deno.json";',
          "// Deno.exit(1) and Bun.spawn([]) in a comment",
          "export const docs = `Deno.cwd() in a template`;",
          "",
        ].join("\n"),
      },
      async (root) => {
        const result = await runtimeJsApis.validator.validate({ root });

        assert.assertEquals(result.passed, true);
        assert.assertEquals(result.issues, []);
      },
    ),
);

nodeTest.test(
  "validate-runtime-js-apis: skips the cross-runtime layer and excluded paths",
  () =>
    withFixture(
      {
        "pkg/@eserstack/standards/cross-runtime/adapters/node.ts":
          "export const cwd = () => process.cwd();\n",
        "etc/scripts/hook.ts": "process.exit(1);\n",
        "lib.ts": "Deno.exit(1);\n",
      },
      async (root) => {
        const result = await runtimeJsApis.validator.validate({
          root,
          options: { exclude: ["etc/scripts/"] },
        });

        assert.assertEquals(result.passed, false);
        assert.assertEquals(
          result.issues.map((issue) => runtime.path.basename(issue.file ?? "")),
          ["lib.ts"],
        );
        assert.assertStringIncludes(
          result.issues[0]!.message,
          "use runtime.process.exit() from @eserstack/standards/cross-runtime",
        );
      },
    ),
);
