// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "../../pkg/@eserstack/test-kit/assert.ts";
import * as pragmas from "./lint-pragmas.ts";

const transform = (src: string) => {
  const stats = pragmas.emptyStats();
  const out = pragmas.transformSource("fixture.ts", src, stats);

  return { out, stats };
};

nodeTest.test("lint-pragmas codemod: rewrites line, file and fmt pragmas", () => {
  const src = `// deno-lint-ignore-file no-console
// deno-lint-ignore no-explicit-any
const a: any = 1;
const b = 2; // deno-lint-ignore no-await-in-loop
// deno-lint-ignore no-top-level-await ban-types no-explicit-any
await f();
// deno-lint-ignore camelcase
const snake_case = 1;
// deno-lint-ignore camelcase no-undef
const other = x;
// deno-fmt-ignore
const m = [1,0,
           0,1];
const s = "// deno-lint-ignore no-explicit-any stays in a string";
/**
 * Docs that mention deno-lint-ignore no-console stay too.
 */
`;
  const want = `/* oxlint-disable no-console */
// oxlint-disable-next-line typescript/no-explicit-any
const a: any = 1;
const b = 2; // oxlint-disable-next-line no-await-in-loop
// oxlint-disable-next-line node/no-top-level-await, typescript/ban-types, typescript/no-explicit-any
await f();
const snake_case = 1;
// oxlint-disable-next-line no-undef
const other = x;
// oxfmt-ignore
const m = [1,0,
           0,1];
const s = "// deno-lint-ignore no-explicit-any stays in a string";
/**
 * Docs that mention deno-lint-ignore no-console stay too.
 */
`;

  const first = transform(src);
  assert.assertEquals(first.out, want);
  assert.assertEquals(first.stats.linePragmas, 5);
  assert.assertEquals(first.stats.filePragmas, 1);
  assert.assertEquals(first.stats.fmtIgnores, 1);
  assert.assertEquals(first.stats.dropped, [
    "fixture.ts:7: camelcase (covered by validate-naming-and-todos)",
    "fixture.ts:9: camelcase (covered by validate-naming-and-todos)",
  ]);
  assert.assertEquals(first.stats.unknown, []);

  // A second run changes nothing.
  assert.assertEquals(transform(first.out).out, first.out);
});

nodeTest.test("lint-pragmas codemod: leaves a pragma with an unknown rule and reports it", () => {
  const src = "// deno-lint-ignore no-such-rule\nconst a = 1;\n";
  const { out, stats } = transform(src);

  assert.assertEquals(out, src);
  assert.assertEquals(stats.unknown, ["fixture.ts:1: no-such-rule"]);
});

nodeTest.test("lint-pragmas codemod: every mapped rule name is a known deno rule or dropped", () => {
  for (const name of Object.keys(pragmas.RULE_MAP)) {
    assert.assertEquals(pragmas.DROPPED[name], undefined, `${name} is both mapped and dropped`);
  }
});
