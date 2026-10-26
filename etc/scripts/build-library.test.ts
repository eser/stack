// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as buildLibrary from "./build-library.ts";

nodeTest.test(
  "importSpecifiers: reads static, re-export and dynamic imports",
  () => {
    const source = [
      'import * as a from "./a.js";',
      'import b, { c } from "../b.js";',
      'import "./side-effect.js";',
      'export { d } from "./d.js";',
      'export * as e from "@scope/e";',
      "const f = await import('./f.js');",
      'import data from "./data.json" with { type: "json" };',
    ].join("\n");

    assert.assertEquals(buildLibrary.importSpecifiers(source), [
      "./a.js",
      "../b.js",
      "./side-effect.js",
      "./d.js",
      "@scope/e",
      "./f.js",
      "./data.json",
    ]);
  },
);

nodeTest.test("importSpecifiers: skips comments and literals", () => {
  const source = [
    "/**",
    ' * import * as example from "./example.ts";',
    " */",
    '// import "./line-comment.ts";',
    'const text = "import x from \\"./in-string.ts\\"";',
    'const template = `from "./in-template.ts" ${"./nested.ts"} done`;',
    'const pattern = /from "\\.\\/in-regexp\\.ts"/u;',
    'const ratio = total / count; const next = "./after-division.ts";',
    'const url = "https://example.com/import.ts";',
    'import real from "./real.js";',
  ].join("\n");

  assert.assertEquals(buildLibrary.importSpecifiers(source), ["./real.js"]);
});

nodeTest.test(
  "importSpecifiers: resumes after a template interpolation",
  () => {
    const source = [
      "const a = `${{ key: `${value}` }.key}`;",
      'import after from "./after.js";',
    ].join("\n");

    assert.assertEquals(buildLibrary.importSpecifiers(source), ["./after.js"]);
  },
);

nodeTest.test(
  "importSpecifiers: a regexp after a keyword is not a division",
  () => {
    const source = [
      'function f(x) { return /"/.test(x); }',
      'import after from "./after.js";',
    ].join("\n");

    assert.assertEquals(buildLibrary.importSpecifiers(source), ["./after.js"]);
  },
);

nodeTest.test(
  "typeScriptSpecifiers: reports .ts, .tsx, .mts and .cts targets",
  () => {
    const source = [
      'import a from "./a.ts";',
      'import b from "./b.tsx";',
      'export { c } from "./c.mts";',
      'const d = import("../d.cts");',
      'import e from "./e.js";',
      'import f from "./types.d.ts";',
    ].join("\n");

    assert.assertEquals(buildLibrary.typeScriptSpecifiers(source), [
      "./a.ts",
      "./b.tsx",
      "./c.mts",
      "../d.cts",
      "./types.d.ts",
    ]);
  },
);

nodeTest.test("isEmitOutput: matches what tsc writes and nothing else", () => {
  for (const name of [
    "mod.js",
    "mod.d.ts",
    "mod.d.ts.map",
    "mod.js.map",
    "package.json",
    "chunk.mjs",
  ]) {
    assert.assertEquals(buildLibrary.isEmitOutput(name), true, name);
  }

  for (const name of [
    "libeser_ajan.dylib",
    "libeser_ajan.h",
    "eser-ajan.wasm",
    "README.md",
    "style.css",
  ]) {
    assert.assertEquals(buildLibrary.isEmitOutput(name), false, name);
  }
});

nodeTest.test("parseCopyDirs: reads both forms and rejects the rest", () => {
  assert.assertEquals(buildLibrary.parseCopyDirs([]), []);
  assert.assertEquals(
    buildLibrary.parseCopyDirs(["--copy", "static", "--copy=assets/icons"]),
    ["static", "assets/icons"],
  );

  assert.assertThrows(() => buildLibrary.parseCopyDirs(["--copy"]));
  assert.assertThrows(() => buildLibrary.parseCopyDirs(["--copy="]));
  assert.assertThrows(() => buildLibrary.parseCopyDirs(["--watch"]));
  assert.assertThrows(() => buildLibrary.parseCopyDirs(["--copy", "../up"]));
  assert.assertThrows(() => buildLibrary.parseCopyDirs(["--copy", "/abs"]));
});

nodeTest.test(
  "cleanPlan: removes build output and keeps everything else",
  () => {
    const plan = buildLibrary.cleanPlan([
      "mod.js",
      "mod.d.ts",
      "package.json",
      "ffi/mod.js",
      "ffi/mod.d.ts",
      "aarch64-darwin/libeser_ajan.dylib",
      "aarch64-darwin/libeser_ajan.h",
      "wasi/eser-ajan.wasm",
      "mixed/kept.css",
      "mixed/emitted.js",
      "chunks/a/b.js",
    ]);

    assert.assertEquals([...plan.dirs].sort(), ["chunks", "ffi"]);
    assert.assertEquals([...plan.files].sort(), [
      "mixed/emitted.js",
      "mod.d.ts",
      "mod.js",
      "package.json",
    ]);
  },
);

nodeTest.test("cleanPlan: removes dist/ itself when nothing stays", () => {
  assert.assertEquals(buildLibrary.cleanPlan(["mod.js", "a/b.d.ts"]), {
    dirs: [""],
    files: [],
  });
  assert.assertEquals(buildLibrary.cleanPlan([]), { dirs: [], files: [] });
});

nodeTest.test("cleanPlan: removes the copied directories whole", () => {
  const plan = buildLibrary.cleanPlan(
    ["mod.js", "static/style.css", "static/icons/icon.svg", "notes.txt"],
    ["static"],
  );

  assert.assertEquals(plan, { dirs: ["static"], files: ["mod.js"] });
});
