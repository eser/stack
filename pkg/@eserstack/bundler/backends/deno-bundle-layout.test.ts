// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as base64 from "@std/encoding/base64";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as layout from "./deno-bundle-layout.ts";

const path = crossRuntime.runtime.path;

// ============================================================================
// lowestCommonAncestorDir
// ============================================================================

const ancestorCases = [
  {
    name: "returns the directory of a single entry",
    files: ["/repo/src/app.ts"],
    expected: "/repo/src",
  },
  {
    name: "returns the shared directory of sibling entries",
    files: ["/repo/src/app.ts", "/repo/src/widget.ts"],
    expected: "/repo/src",
  },
  {
    name: "returns the parent of an entry in a subdirectory",
    files: ["/repo/src/app.ts", "/repo/src/app/widget.ts"],
    expected: "/repo/src",
  },
  {
    name: "compares whole directory names, not prefixes",
    files: ["/repo/ab/app.ts", "/repo/abc/app.ts"],
    expected: "/repo",
  },
  {
    name: "returns the root for unrelated directories",
    files: ["/tmp/deno-bundle-1/_build-id-entry.ts", "/repo/src/app.ts"],
    expected: "/",
  },
];

for (const { name, files, expected } of ancestorCases) {
  Deno.test(`lowestCommonAncestorDir ${name}`, () => {
    assert.assertEquals(
      layout.lowestCommonAncestorDir(files),
      path.resolve(expected),
    );
  });
}

// ============================================================================
// denoOutputName
// ============================================================================

const outputNameCases = [
  {
    name: "replaces the extension with .js",
    entry: "/repo/src/app.tsx",
    outbase: "/repo/src",
    expected: "app.js",
  },
  {
    name: "keeps the directories below the outbase",
    entry: "/repo/src/app/widget.ts",
    outbase: "/repo",
    expected: "src/app/widget.js",
  },
  {
    name: "adds .js to a file without an extension",
    entry: "/repo/src/entry",
    outbase: "/repo",
    expected: "src/entry.js",
  },
];

for (const { name, entry, outbase, expected } of outputNameCases) {
  Deno.test(`denoOutputName ${name}`, () => {
    assert.assertEquals(
      layout.denoOutputName(path.resolve(entry), path.resolve(outbase)),
      expected,
    );
  });
}

// ============================================================================
// rewriteRelativeImports
// ============================================================================

const finalNames = new Map([
  ["dist/_client-entry.js", "client.js"],
  ["src/app/widget.js", "src/app/widget.tsx.js"],
  ["chunk-ABC123.js", "chunk-ABC123.js"],
]);

Deno.test("rewriteRelativeImports points a moved entry at its chunk", () => {
  const rewritten = layout.rewriteRelativeImports(
    'import { mode } from "../../chunk-ABC123.js";\nexport { mode };\n',
    "src/app/widget.js",
    "src/app/widget.tsx.js",
    finalNames,
  );

  assert.assertEquals(
    rewritten.code,
    'import { mode } from "../../chunk-ABC123.js";\nexport { mode };\n',
  );
  assert.assertEquals(rewritten.imports, [
    { path: "chunk-ABC123.js", kind: "import-statement" },
  ]);
});

Deno.test("rewriteRelativeImports follows an entry that moves up", () => {
  const rewritten = layout.rewriteRelativeImports(
    'import{mode}from"../chunk-ABC123.js";' +
      'const load=()=>import("../src/app/widget.js");',
    "dist/_client-entry.js",
    "client.js",
    finalNames,
  );

  assert.assertEquals(
    rewritten.code,
    'import{mode}from"./chunk-ABC123.js";' +
      'const load=()=>import("./src/app/widget.tsx.js");',
  );
  assert.assertEquals(rewritten.imports, [
    { path: "chunk-ABC123.js", kind: "import-statement" },
    { path: "src/app/widget.tsx.js", kind: "dynamic-import" },
  ]);
});

Deno.test("rewriteRelativeImports keeps side-effect imports and re-exports", () => {
  const rewritten = layout.rewriteRelativeImports(
    'import "../chunk-ABC123.js";\nexport * from "../chunk-ABC123.js";\n',
    "dist/_client-entry.js",
    "client.js",
    finalNames,
  );

  assert.assertEquals(
    rewritten.code,
    'import "./chunk-ABC123.js";\nexport * from "./chunk-ABC123.js";\n',
  );
  assert.assertEquals(rewritten.imports, [
    { path: "chunk-ABC123.js", kind: "import-statement" },
  ]);
});

Deno.test("rewriteRelativeImports leaves imports outside the bundle alone", () => {
  const code = 'import x from "./vendor/lib.js";\nimport y from "react";\n' +
    'import z from "../../../../outside.js";\n';
  const rewritten = layout.rewriteRelativeImports(
    code,
    "src/app/widget.js",
    "src/app/widget.tsx.js",
    finalNames,
  );

  assert.assertEquals(rewritten.code, code);
  assert.assertEquals(rewritten.imports, []);
});

// ============================================================================
// setSourceMappingUrl
// ============================================================================

Deno.test("setSourceMappingUrl appends the comment", () => {
  assert.assertEquals(
    layout.setSourceMappingUrl("export {};\n", "app.js.map"),
    "export {};\n//# sourceMappingURL=app.js.map\n",
  );
});

Deno.test("setSourceMappingUrl replaces an existing comment", () => {
  assert.assertEquals(
    layout.setSourceMappingUrl(
      "export {};\n//# sourceMappingURL=old.js.map\n",
      "app.js.map",
    ),
    "export {};\n//# sourceMappingURL=app.js.map\n",
  );
});

// ============================================================================
// relocateSourceMap
// ============================================================================

Deno.test("relocateSourceMap keeps relative sources pointing at the same file", () => {
  const fromDir = path.resolve("/tmp/deno-bundle-1/repo/src");
  const toDir = path.resolve("/out/src");
  const map = JSON.stringify({
    version: 3,
    sources: ["../../../../repo/src/app.ts", "file:///repo/x.ts", "/abs.ts"],
    mappings: "AAAA",
  });

  const relocated = JSON.parse(layout.relocateSourceMap(map, fromDir, toDir));

  assert.assertEquals(
    path.resolve(toDir, relocated.sources[0]),
    path.resolve("/repo/src/app.ts"),
  );
  assert.assertEquals(relocated.sources.slice(1), [
    "file:///repo/x.ts",
    "/abs.ts",
  ]);
  assert.assertEquals(relocated.mappings, "AAAA");
});

Deno.test("relocateSourceMap leaves a map with a sourceRoot unchanged", () => {
  const map = JSON.stringify({
    version: 3,
    sourceRoot: "/repo",
    sources: ["src/app.ts"],
    mappings: "AAAA",
  });

  assert.assertEquals(layout.relocateSourceMap(map, "/a", "/b"), map);
});

Deno.test("relocateSourceMap rejects a map that is not JSON", () => {
  assert.assertThrows(
    () => layout.relocateSourceMap("not json", "/a", "/b"),
    SyntaxError,
  );
});

// ============================================================================
// relocateInlineSourceMap
// ============================================================================

const inlineMapComment = (map: unknown): string =>
  `//# sourceMappingURL=data:application/json;base64,${
    base64.encodeBase64(JSON.stringify(map))
  }`;

const readInlineMap = (code: string): { sources: string[] } => {
  const encoded = code.split("base64,").at(-1)?.trim() ?? "";
  return JSON.parse(new TextDecoder().decode(base64.decodeBase64(encoded)));
};

Deno.test("relocateInlineSourceMap keeps inline sources pointing at the same file", () => {
  const fromDir = path.resolve("/tmp/deno-bundle-1/repo/src");
  const toDir = path.resolve("/out/src");
  const code = `export const app = "ü";\n${
    inlineMapComment({
      version: 3,
      sources: ["../../../../repo/src/app.ts"],
      sourcesContent: ['export const app = "ü";\n'],
      mappings: "AAAA",
    })
  }\n`;

  const relocated = layout.relocateInlineSourceMap(code, fromDir, toDir);
  const map = readInlineMap(relocated);

  assert.assert(relocated.startsWith('export const app = "ü";\n'));
  assert.assert(relocated.endsWith("\n"));
  assert.assertEquals(
    path.resolve(toDir, map.sources[0] ?? ""),
    path.resolve("/repo/src/app.ts"),
  );
});

Deno.test("relocateInlineSourceMap leaves code without an inline map unchanged", () => {
  const code = "export {};\n//# sourceMappingURL=app.js.map\n";

  assert.assertEquals(layout.relocateInlineSourceMap(code, "/a", "/b"), code);
});
