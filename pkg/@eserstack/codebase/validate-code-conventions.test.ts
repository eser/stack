// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as conventions from "./validate-code-conventions.ts";

const rules = (source: string): string[] =>
  conventions.findViolations(source).map((v) => `${v.line}:${v.rule}`);

nodeTest.test(
  "validate-code-conventions: accepts namespace, runtime and type imports",
  () => {
    const source = [
      'import * as path from "node:path";',
      'import { runtime } from "@eserstack/standards/cross-runtime";',
      'import type { Options } from "./options.ts";',
      'import { type A, type B } from "./types.ts";',
      'import styles from "./card.module.css";',
      'import pkg from "./package.json" with { type: "json" };',
      'import "./side-effect.ts";',
      'export { helper } from "./helper.ts";',
      'const lazy = () => import("./lazy.ts");',
    ].join("\n");

    assert.assertEquals(rules(source), []);
  },
);

nodeTest.test(
  "validate-code-conventions: flags named, default and multi-line imports",
  () => {
    const source = [
      'import { join } from "node:path";',
      'import React from "react";',
      'import { card } from "./card.module.css";',
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
      "4:namespace-import",
      "8:namespace-import",
      "9:namespace-import",
    ]);
  },
);

nodeTest.test(
  "validate-code-conventions: flags literal defaults after ||",
  () => {
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
  },
);

nodeTest.test(
  "validate-code-conventions: reads template interpolations as code",
  () => {
    const source = [
      'const label = `${name || "anonymous"}`;',
      "const text = `a || []`;",
    ].join("\n");

    assert.assertEquals(rules(source), ["1:or-default"]);
  },
);

nodeTest.test(
  "validate-code-conventions: flags wildcard re-exports but not namespace re-exports",
  () => {
    const source = [
      'export * from "./a.ts";',
      'export type * from "./types.ts";',
      "export *",
      '  from "./multi-line.ts";',
      'export * as b from "./b.ts";',
      'export type * as t from "./t.ts";',
      'export { c } from "./c.ts";',
      'export type { D } from "./d.ts";',
      '// export * from "./e.ts";',
      'const doc = `export * from "./f.ts"`;',
    ].join("\n");

    assert.assertEquals(rules(source), [
      "1:export-star",
      "2:export-star",
      "3:export-star",
    ]);
  },
);

nodeTest.test("validate-code-conventions: ignores comments and strings", () => {
  const source = [
    '// import { join } from "node:path";',
    "/**",
    ' * import { join } from "node:path";',
    " * const x = y || [];",
    " */",
    'const text = "a || []";',
    "const fixture = `",
    'import { join } from "node:path";',
    "`;",
  ].join("\n");

  assert.assertEquals(rules(source), []);
});

nodeTest.test(
  "validate-code-conventions: fails only above the baseline",
  async () => {
    const root = await runtime.fs.makeTempDir({
      prefix: "validate-code-conventions-test-",
    });
    try {
      await runtime.fs.writeTextFile(
        runtime.path.join(root, "old.ts"),
        'import { join } from "node:path";\n',
      );
      await conventions.writeBaseline(root);

      const clean = await conventions.run({ root });
      assert.assertEquals(clean.issues.length, 0);

      await runtime.fs.writeTextFile(
        runtime.path.join(root, "old.ts"),
        'import { join } from "node:path";\nimport { basename } from "node:path";\n',
      );
      await runtime.fs.writeTextFile(
        runtime.path.join(root, "new.ts"),
        "const items = list || [];\n",
      );
      await runtime.fs.writeTextFile(
        runtime.path.join(root, "mod.ts"),
        'export * from "./old.ts";\n',
      );

      const result = await conventions.run({ root });
      const found = result.issues
        .map((i) => `${runtime.path.basename(i.path)}:${i.line}`)
        .sort();
      assert.assertEquals(found, [
        "mod.ts:1",
        "new.ts:1",
        "old.ts:1",
        "old.ts:2",
      ]);
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
);
