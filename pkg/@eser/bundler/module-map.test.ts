// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  addModule,
  createModuleMap,
  getAllChunks,
  getModule,
  hasModule,
  type ModuleEntry,
} from "./module-map.ts";

// ============================================================================
// createModuleMap tests
// ============================================================================

Deno.test("createModuleMap returns empty object", () => {
  const map = createModuleMap();

  assert.assertEquals(map, {});
  assert.assertEquals(Object.keys(map).length, 0);
});

// ============================================================================
// addModule tests
// ============================================================================

Deno.test("addModule adds module by ID", () => {
  const map = createModuleMap();
  const entry: ModuleEntry = {
    id: "./src/App.tsx",
    name: "App",
    chunks: ["main.js"],
  };

  const updated = addModule(map, entry);

  assert.assertExists(updated["./src/App.tsx"]);
  assert.assertEquals(updated["./src/App.tsx"], entry);
});

Deno.test("addModule preserves existing modules", () => {
  let map = createModuleMap();
  const entry1: ModuleEntry = {
    id: "./src/A.tsx",
    name: "A",
    chunks: ["a.js"],
  };
  const entry2: ModuleEntry = {
    id: "./src/B.tsx",
    name: "B",
    chunks: ["b.js"],
  };

  map = addModule(map, entry1);
  map = addModule(map, entry2);

  assert.assertExists(map["./src/A.tsx"]);
  assert.assertExists(map["./src/B.tsx"]);
  assert.assertEquals(Object.keys(map).length, 2);
});

Deno.test("addModule is immutable - does not modify original", () => {
  const original = createModuleMap();
  const entry: ModuleEntry = {
    id: "./src/New.tsx",
    name: "New",
    chunks: ["new.js"],
  };

  const updated = addModule(original, entry);

  assert.assertEquals(Object.keys(original).length, 0);
  assert.assertEquals(Object.keys(updated).length, 1);
});

Deno.test("addModule allows updating existing module", () => {
  let map = createModuleMap();
  const entry1: ModuleEntry = {
    id: "./src/App.tsx",
    name: "App",
    chunks: ["old.js"],
  };
  const entry2: ModuleEntry = {
    id: "./src/App.tsx",
    name: "UpdatedApp",
    chunks: ["new.js"],
  };

  map = addModule(map, entry1);
  map = addModule(map, entry2);

  assert.assertEquals(Object.keys(map).length, 1);
  assert.assertEquals(map["./src/App.tsx"]?.name, "UpdatedApp");
  assert.assertEquals(map["./src/App.tsx"]?.chunks[0], "new.js");
});

// ============================================================================
// getModule tests
// ============================================================================

Deno.test("getModule returns module by ID", () => {
  let map = createModuleMap();
  const entry: ModuleEntry = {
    id: "./src/Counter.tsx",
    name: "Counter",
    chunks: ["counter-chunk.js"],
  };
  map = addModule(map, entry);

  const result = getModule(map, "./src/Counter.tsx");

  assert.assertEquals(result, entry);
});

Deno.test("getModule returns undefined for non-existent ID", () => {
  const map = createModuleMap();

  const result = getModule(map, "./src/NotFound.tsx");

  assert.assertEquals(result, undefined);
});

// ============================================================================
// hasModule tests
// ============================================================================

Deno.test("hasModule returns true for existing module", () => {
  let map = createModuleMap();
  const entry: ModuleEntry = {
    id: "./src/Button.tsx",
    name: "Button",
    chunks: ["button.js"],
  };
  map = addModule(map, entry);

  assert.assertEquals(hasModule(map, "./src/Button.tsx"), true);
});

Deno.test("hasModule returns false for non-existent module", () => {
  const map = createModuleMap();

  assert.assertEquals(hasModule(map, "./src/Missing.tsx"), false);
});

// ============================================================================
// getAllChunks tests
// ============================================================================

Deno.test("getAllChunks returns empty array for empty map", () => {
  const map = createModuleMap();

  const chunks = getAllChunks(map);

  assert.assertEquals(chunks, []);
});

Deno.test("getAllChunks returns all unique chunks", () => {
  let map = createModuleMap();
  map = addModule(map, {
    id: "./A.tsx",
    name: "A",
    chunks: ["chunk-a.js", "shared.js"],
  });
  map = addModule(map, {
    id: "./B.tsx",
    name: "B",
    chunks: ["chunk-b.js", "vendor.js"],
  });

  const chunks = getAllChunks(map);

  assert.assertEquals(chunks.length, 4);
  assert.assert(chunks.includes("chunk-a.js"));
  assert.assert(chunks.includes("chunk-b.js"));
  assert.assert(chunks.includes("shared.js"));
  assert.assert(chunks.includes("vendor.js"));
});

Deno.test("getAllChunks deduplicates chunks across modules", () => {
  let map = createModuleMap();
  map = addModule(map, {
    id: "./A.tsx",
    name: "A",
    chunks: ["common.js", "a.js"],
  });
  map = addModule(map, {
    id: "./B.tsx",
    name: "B",
    chunks: ["common.js", "b.js"],
  });
  map = addModule(map, {
    id: "./C.tsx",
    name: "C",
    chunks: ["common.js", "c.js"],
  });

  const chunks = getAllChunks(map);

  // common.js should only appear once
  assert.assertEquals(chunks.filter((c) => c === "common.js").length, 1);
  assert.assertEquals(chunks.length, 4); // common, a, b, c
});

Deno.test("getAllChunks handles modules with overlapping chunks", () => {
  let map = createModuleMap();
  map = addModule(map, {
    id: "./A.tsx",
    name: "A",
    chunks: ["vendor.js", "react.js"],
  });
  map = addModule(map, {
    id: "./B.tsx",
    name: "B",
    chunks: ["vendor.js", "react.js", "extra.js"],
  });

  const chunks = getAllChunks(map);

  assert.assertEquals(chunks.length, 3); // vendor, react, extra
  assert.assertEquals(chunks.filter((c) => c === "vendor.js").length, 1);
  assert.assertEquals(chunks.filter((c) => c === "react.js").length, 1);
});

Deno.test("getAllChunks handles single module", () => {
  let map = createModuleMap();
  map = addModule(map, {
    id: "./Single.tsx",
    name: "Single",
    chunks: ["single.js"],
  });

  const chunks = getAllChunks(map);

  assert.assertEquals(chunks, ["single.js"]);
});

Deno.test("getAllChunks handles module with multiple chunks", () => {
  let map = createModuleMap();
  map = addModule(map, {
    id: "./Large.tsx",
    name: "Large",
    chunks: ["chunk1.js", "chunk2.js", "chunk3.js", "chunk4.js"],
  });

  const chunks = getAllChunks(map);

  assert.assertEquals(chunks.length, 4);
});
