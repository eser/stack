// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "../../pkg/@eserstack/test-kit/assert.ts";
import * as tests from "./tests.ts";

const transform = (src: string) => {
  const stats = tests.emptyStats();
  const out = tests.transformSource("fixture.test.ts", src, stats);

  return { out, stats };
};

const cases: ReadonlyArray<{ name: string; src: string; want: string }> = [
  {
    name: "Deno.test(name, fn)",
    src: `import * as assert from "@eserstack/test-kit/assert";

Deno.test("adds", () => {
  assert.assertEquals(1 + 1, 2);
});
`,
    want: `import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";

nodeTest.test("adds", () => {
  assert.assertEquals(1 + 1, 2);
});
`,
  },
  {
    name: "Deno.test(name, options, fn) with ignore and sanitizers",
    src: `Deno.test("slow", { ignore: Deno.build.os === "windows", sanitizeOps: false, sanitizeResources: false }, async () => {});
`,
    want: `import * as nodeTest from "node:test";
nodeTest.test("slow", { skip: Deno.build.os === "windows" }, async () => {});
`,
  },
  {
    name: "Deno.test({ name, fn, ... }) with a method fn and permissions",
    src: `Deno.test({
  name: "object form",
  permissions: { read: true },
  sanitizeExit: false,
  async fn(t) {
    await t.step("inner", () => {});
  },
});
`,
    want: `import * as nodeTest from "node:test";
nodeTest.test("object form", async function (t) {
    await t.test("inner", () => {});
  });
`,
  },
  {
    name: "Deno.test.ignore and Deno.test.only",
    src: `Deno.test.ignore("a", () => {});
Deno.test.only("b", () => {});
`,
    want: `import * as nodeTest from "node:test";
nodeTest.test("a", { skip: true }, () => {});
nodeTest.test("b", { only: true }, () => {});
`,
  },
  {
    name: "a named function alone",
    src: `Deno.test(function worksAlone() {});
`,
    want: `import * as nodeTest from "node:test";
nodeTest.test("worksAlone", function worksAlone() {});
`,
  },
  {
    name: "t.step object form under another context name",
    src: `Deno.test("outer", async (ctx) => {
  await ctx.step({ name: "inner", ignore: true, fn: () => {} });
});
`,
    want: `import * as nodeTest from "node:test";
nodeTest.test("outer", async (ctx) => {
  await ctx.test("inner", { skip: true }, () => {});
});
`,
  },
  {
    name: "@std/testing/bdd under the same namespace, object forms and hooks",
    src: `import * as bdd from "@std/testing/bdd";

bdd.describe({ name: "suite", sanitizeResources: false, fn: () => {
  bdd.beforeAll(() => {});
  bdd.afterAll(() => {});
  bdd.it({ name: "case", fn: () => {} });
  bdd.it.ignore("skipped", () => {});
  bdd.it("plain", { sanitizeOps: false }, () => {});
} });
`,
    want: `import * as bdd from "node:test";

bdd.describe("suite", () => {
  bdd.before(() => {});
  bdd.after(() => {});
  bdd.it("case", () => {});
  bdd.it.skip("skipped", () => {});
  bdd.it("plain", {}, () => {});
});
`,
  },
  {
    name: "a file with nothing to change",
    src: `import * as nodeTest from "node:test";
nodeTest.test("done", () => {});
`,
    want: `import * as nodeTest from "node:test";
nodeTest.test("done", () => {});
`,
  },
];

for (const { name, src, want } of cases) {
  nodeTest.test(`tests codemod: ${name}`, () => {
    const first = transform(src);
    assert.assertEquals(first.out, want);
    assert.assertEquals(first.stats.unhandled, []);

    // A second run changes nothing.
    assert.assertEquals(transform(first.out).out, first.out);
  });
}

nodeTest.test("tests codemod: counts what it changes", () => {
  const { stats } = transform(cases.map((c) => c.src).join("\n"));

  assert.assertEquals(stats.denoTest, 7);
  assert.assertEquals(stats.step, 2);
  assert.assertEquals(stats.sanitizerKeys, 5);
  assert.assertEquals(stats.permissionsKeys, 1);
  assert.assertEquals(stats.bddFiles, 1);
  assert.assertEquals(stats.bddObjectForm, 2);
  assert.assertEquals(stats.bddHooksRenamed, 2);
});

nodeTest.test("tests codemod: lists a site it cannot transform", () => {
  const { out, stats } = transform(`const alias = Deno.test;
Deno.test({ name: "x", fn() {}, timeout: 5 });
`);

  assert.assertStringIncludes(out, `Deno.test({ name: "x", fn() {}, timeout: 5 })`);
  assert.assertEquals(stats.unhandled, [
    "fixture.test.ts:2: option timeout has no node:test equivalent",
    "fixture.test.ts:2: Deno.test in an unknown shape",
    "fixture.test.ts:1: Deno.test is not called directly",
  ]);
});
