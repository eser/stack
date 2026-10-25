// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as path from "@std/path";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as runtimeJsApis from "./validate-runtime-js-apis.ts";

const rules = (source: string): string[] =>
  runtimeJsApis.findViolations(source).map((v) => `${v.line}:${v.rule}`);

const cases: ReadonlyArray<{
  readonly name: string;
  readonly source: readonly string[];
  readonly expected: readonly string[];
}> = [
  {
    name: "reports the listed Deno APIs",
    source: [
      "const text = await Deno.readTextFile(file);",
      "Deno.exit(1);",
      "const cwd = Deno.cwd();",
    ],
    expected: ["1:deno", "2:deno", "3:deno"],
  },
  {
    name: "reports members of Node's global process",
    source: [
      "const token = process.env.GITHUB_TOKEN;",
      "process.exit(1);",
      "const [, , input] = process.argv;",
    ],
    expected: ["1:process", "2:process", "3:process"],
  },
  {
    name: "reports process reached through globalThis",
    source: ["const platform = globalThis.process.platform;"],
    expected: ["1:process"],
  },
  {
    name: "reports members of the Bun global",
    source: [
      'const child = Bun.spawn(["ls"]);',
      "const version = globalThis.Bun.version;",
    ],
    expected: ["1:bun", "2:bun"],
  },
  {
    name: "reports every use on a line",
    source: ["const both = process.env.A ?? process.env.B;"],
    expected: ["1:process", "1:process"],
  },
  {
    name: "reports process.env inside a template interpolation",
    source: ["const url = `${process.env.API_URL}/v1`;"],
    expected: ["1:process"],
  },
  {
    name: "accepts the cross-runtime API",
    source: [
      'import { runtime } from "@eserstack/standards/cross-runtime";',
      "const cwd = runtime.process.cwd();",
      'const token = runtime.env.get("TOKEN");',
      "const args = runtime.process.args;",
    ],
    expected: [],
  },
  {
    name: "accepts runtime detection with typeof",
    source: [
      'const isNode = typeof process !== "undefined";',
      'const isBun = typeof Bun !== "undefined";',
    ],
    expected: [],
  },
  {
    name: "ignores comments, JSDoc and strings",
    source: [
      "// process.env.TOKEN",
      "/**",
      " * const text = await Deno.readTextFile(file);",
      " * Bun.spawn([]);",
      " */",
      'const hint = "process.exit(1)";',
      "const docs = `Bun.spawn and Deno.exit`;",
    ],
    expected: [],
  },
  {
    name: "checks only process.env in a file that declares its own process",
    source: [
      "const process = spawnChild(cmd);",
      "const exit = await process.waitForExit();",
      "process.kill();",
      "const token = process.env.TOKEN;",
      "globalThis.process.exit(1);",
    ],
    expected: ["4:process", "5:process"],
  },
  {
    name: "treats a process parameter as a local binding",
    source: [
      "const wait = async (process: ChildProcess) => {",
      "  await process.stdout.cancel();",
      "  return await process.waitForExit();",
      "};",
    ],
    expected: [],
  },
  {
    name: "treats process destructured from runtime as a local binding",
    source: ["const { process } = runtime;", "process.exit(1);"],
    expected: [],
  },
  {
    name: "does not take a commented-out declaration for a binding",
    source: ["// const process = spawnChild(cmd);", "process.exit(1);"],
    expected: ["2:process"],
  },
];

for (const { name, source, expected } of cases) {
  nodeTest.test(`validate-runtime-js-apis: ${name}`, () => {
    assert.assertEquals(rules(source.join("\n")), [...expected]);
  });
}

nodeTest.test(
  "validate-runtime-js-apis: names the cross-runtime replacement",
  () => {
    const [violation] = runtimeJsApis.findViolations(
      "const token = process.env.TOKEN;",
    );

    assert.assertStringIncludes(violation!.message, "process.env");
    assert.assertStringIncludes(violation!.message, "runtime.env.get()");
    assert.assertStringIncludes(
      violation!.message,
      "@eserstack/standards/cross-runtime",
    );
  },
);

nodeTest.test(
  "validate-runtime-js-apis: gives a general hint for other members",
  () => {
    const messages = runtimeJsApis
      .findViolations(
        "const t = process.hrtime();\nconst c = process.constructor;",
      )
      .map((v) => v.message);

    assert.assertEquals(messages.length, 2);
    for (const message of messages) {
      assert.assertStringIncludes(message, "the matching runtime API");
    }
  },
);

const writeFile = async (
  root: string,
  relPath: string,
  content: string,
): Promise<void> => {
  const file = path.join(root, relPath);
  await runtime.fs.mkdir(path.dirname(file), { recursive: true });
  await runtime.fs.writeTextFile(file, content);
};

const withTempRoot = async (
  fn: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await runtime.fs.makeTempDir({
    prefix: "validate-runtime-js-apis-test-",
  });
  try {
    await fn(root);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
};

const foundIn = (
  issues: readonly { readonly path: string; readonly line?: number }[],
): string[] => issues.map((i) => `${path.basename(i.path)}:${i.line}`).sort();

// sanitizeResources is off because file-tool.ts loads the FFI DynamicLibrary,
// which stays open after the test.
nodeTest.test(
  "validate-runtime-js-apis: skips tests and the cross-runtime layer, and fails only above the baseline",
  () =>
    withTempRoot(async (root) => {
      await writeFile(root, "lib.ts", "const a = process.env.A;\n");
      await writeFile(root, "lib.test.ts", "const a = process.env.A;\n");
      await writeFile(root, "legacy_test.ts", "Deno.exit(1);\n");
      await writeFile(
        root,
        "pkg/@eserstack/standards/cross-runtime/adapters/node.ts",
        "export const cwd = () => process.cwd();\n",
      );

      const before = await runtimeJsApis.run({ root });
      assert.assertEquals(foundIn(before.issues), ["lib.ts:1"]);

      const total = await runtimeJsApis.writeBaseline(root);
      assert.assertEquals(total, 1);
      const clean = await runtimeJsApis.run({ root });
      assert.assertEquals(clean.issues.length, 0);

      await writeFile(
        root,
        "lib.ts",
        "const a = process.env.A;\nconst b = process.env.B;\n",
      );
      await writeFile(root, "new.ts", "const child = Bun.spawn([]);\n");

      const result = await runtimeJsApis.run({ root });
      assert.assertEquals(foundIn(result.issues), [
        "lib.ts:1",
        "lib.ts:2",
        "new.ts:1",
      ]);
      const overBaseline = result.issues.find(
        (i) => path.basename(i.path) === "lib.ts",
      );
      assert.assertStringIncludes(
        overBaseline!.message,
        "[2 in this file, baseline allows 1]",
      );
    }),
);

nodeTest.test(
  "validate-runtime-js-apis: a corrupt baseline fails with the fix",
  () =>
    withTempRoot(async (root) => {
      await writeFile(root, "lib.ts", "const a = process.env.A;\n");
      await writeFile(root, runtimeJsApis.DEFAULT_BASELINE_PATH, "{ not json");

      const error = await assert.assertRejects(() =>
        runtimeJsApis.run({ root }),
      );
      assert.assertStringIncludes(String(error), "is not valid JSON");
      assert.assertStringIncludes(String(error), "--write-baseline");
    }),
);

nodeTest.test(
  "validate-runtime-js-apis: a baseline option that is not a path fails",
  () =>
    withTempRoot(async (root) => {
      await writeFile(root, "lib.ts", "export const a = 1;\n");

      const error = await assert.assertRejects(() =>
        runtimeJsApis.run({ root, baseline: 42 }),
      );
      assert.assertStringIncludes(String(error), "baseline option");
      assert.assertStringIncludes(String(error), ".eser/manifest.yml");
    }),
);
