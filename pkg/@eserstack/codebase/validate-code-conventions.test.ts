// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as path from "@std/path";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as conventions from "./validate-code-conventions.ts";

const rules = (source: string): string[] =>
  conventions.findViolations(source).map((v) => `${v.line}:${v.rule}`);

Deno.test("validate-code-conventions: accepts namespace, runtime and type imports", () => {
  const source = [
    'import * as path from "@std/path";',
    'import { runtime } from "@eserstack/standards/cross-runtime";',
    'import type { Options } from "./options.ts";',
    'import { type A, type B } from "./types.ts";',
    'import "./side-effect.ts";',
    'export { helper } from "./helper.ts";',
    'const lazy = () => import("./lazy.ts");',
  ].join("\n");

  assert.assertEquals(rules(source), []);
});

Deno.test("validate-code-conventions: flags named, default and multi-line imports", () => {
  const source = [
    'import { join } from "@std/path";',
    'import React from "react";',
    "import {",
    "  describe,",
    "  it,",
    '} from "@std/testing/bdd";',
    'import { runtime } from "./local-runtime.ts";',
    'import { type A, b } from "./mixed.ts";',
  ].join("\n");

  assert.assertEquals(rules(source), [
    "1:namespace-import",
    "2:namespace-import",
    "3:namespace-import",
    "7:namespace-import",
    "8:namespace-import",
  ]);
});

Deno.test("validate-code-conventions: flags literal defaults after ||", () => {
  const source = [
    'const name = input || "anonymous";',
    "const items = list || [];",
    "const port = config.port || 8080;",
    "const ok = isReady || isForced;",
    "const flag = a || false;",
    'const safe = input ?? "";',
  ].join("\n");

  assert.assertEquals(rules(source), [
    "1:or-default",
    "2:or-default",
    "3:or-default",
  ]);
});

Deno.test("validate-code-conventions: ignores comments and strings", () => {
  const source = [
    '// import { join } from "@std/path";',
    "/**",
    ' * import { join } from "@std/path";',
    " * const x = y || [];",
    " */",
    'const text = "a || []";',
    "const fixture = `",
    'import { join } from "@std/path";',
    "`;",
  ].join("\n");

  assert.assertEquals(rules(source), []);
});

// sanitizeResources: false — file-tool.ts transitively loads the FFI DynamicLibrary
Deno.test({
  name: "validate-code-conventions: fails only above the baseline",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const root = await runtime.fs.makeTempDir({
      prefix: "validate-code-conventions-test-",
    });
    try {
      await runtime.fs.writeTextFile(
        path.join(root, "old.ts"),
        'import { join } from "@std/path";\n',
      );
      await conventions.writeBaseline(root);

      const clean = await conventions.run({ root });
      assert.assertEquals(clean.issues.length, 0);

      await runtime.fs.writeTextFile(
        path.join(root, "old.ts"),
        'import { join } from "@std/path";\nimport { basename } from "@std/path";\n',
      );
      await runtime.fs.writeTextFile(
        path.join(root, "new.ts"),
        "const items = list || [];\n",
      );

      const result = await conventions.run({ root });
      const found = result.issues
        .map((i) => `${path.basename(i.path)}:${i.line}`)
        .sort();
      assert.assertEquals(found, ["new.ts:1", "old.ts:1", "old.ts:2"]);
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
});
