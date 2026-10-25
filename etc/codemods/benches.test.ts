// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "../../pkg/@eserstack/test-kit/assert.ts";
import * as benches from "./benches.ts";

const transform = (src: string) => {
  const stats = benches.emptyStats();
  const out = benches.transformSource("fixture.bench.ts", src, stats);

  return { out, stats };
};

const fixture = `import * as math from "./math.ts";

const group = "sum";

Deno.bench("loop", { group, baseline: true }, () => {
  let total = 0;
  for (let i = 0; i < 10; i++) total += i;
});

const values = [1, 2, 3];

Deno.bench("reduce", { group }, () => {
  values.reduce((a, b) => a + b, 0);
});

Deno.bench("join", { group: "strings" }, () => {
  values.join(",");
});

Deno.bench("alone", () => {
  String(values.length);
});
`;

const want = `import * as mitata from "mitata";
import * as math from "./math.ts";

const group = "sum";

mitata.group(group, () => {
  mitata.summary(() => {
    mitata.bench("loop", () => {
      let total = 0;
      for (let i = 0; i < 10; i++) total += i;
    }).baseline();
    mitata.bench("reduce", () => {
      values.reduce((a, b) => a + b, 0);
    });
  });
});

const values = [1, 2, 3];

mitata.group("strings", () => {
  mitata.summary(() => {
    mitata.bench("join", () => {
      values.join(",");
    });
  });
});

mitata.bench("alone", () => {
  String(values.length);
});

// oxlint-disable-next-line node/no-top-level-await
await mitata.run();
`;

nodeTest.test("benches codemod: groups benches with their baseline", () => {
  const first = transform(fixture);

  assert.assertEquals(first.out, want);
  assert.assertEquals(first.stats.benches, 4);
  assert.assertEquals(first.stats.groups, 2);
  assert.assertEquals(first.stats.baselines, 1);
  assert.assertEquals(first.stats.unhandled, []);

  // A second run changes nothing.
  assert.assertEquals(transform(first.out).out, first.out);
});

nodeTest.test("benches codemod: lists a bench with an option mitata lacks", () => {
  const src = `Deno.bench("x", { group: "g", n: 10 }, () => {});\n`;
  const { out, stats } = transform(src);

  assert.assertEquals(out, src);
  assert.assertEquals(stats.unhandled, [
    "fixture.bench.ts:1: option n has no mitata equivalent",
  ]);
});

nodeTest.test("benches codemod: the converted bench runs under node", () => {
  const dir = fs.mkdtempSync(path.join(import.meta.dirname, "..", "temp", "codemod-bench-"));
  try {
    fs.writeFileSync(path.join(dir, "math.ts"), "export const one = 1;\n");
    fs.writeFileSync(path.join(dir, "fixture.bench.ts"), transform(fixture).out);

    const output = childProcess.execFileSync(process.execPath, [path.join(dir, "fixture.bench.ts")], {
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 120_000,
    });

    for (const name of ["loop", "reduce", "join", "alone"]) {
      assert.assertStringIncludes(output, name);
    }
    // summary() prints how the other benches compare with the baseline.
    assert.assertStringIncludes(output, "summary");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
