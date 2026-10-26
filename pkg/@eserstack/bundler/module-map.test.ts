// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as moduleMap from "./module-map.ts";
import type { ModuleEntry } from "./module-map.ts";

// ============================================================================
// createModuleMap tests
// ============================================================================

nodeTest.test("createModuleMap returns empty object", () => {
  const map = moduleMap.createModuleMap();

  assert.assertEquals(map, {});
  assert.assertEquals(Object.keys(map).length, 0);
});

// ============================================================================
// addModule tests
// ============================================================================

nodeTest.test("addModule adds module by ID", () => {
  const map = moduleMap.createModuleMap();
  const entry: ModuleEntry = {
    id: "./src/App.tsx",
    name: "App",
    chunks: ["main.js"],
  };

  const updated = moduleMap.addModule(map, entry);

  assert.assertExists(updated["./src/App.tsx"]);
  assert.assertEquals(updated["./src/App.tsx"], entry);
});

nodeTest.test("addModule preserves existing modules", () => {
  let map = moduleMap.createModuleMap();
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

  map = moduleMap.addModule(map, entry1);
  map = moduleMap.addModule(map, entry2);

  assert.assertExists(map["./src/A.tsx"]);
  assert.assertExists(map["./src/B.tsx"]);
  assert.assertEquals(Object.keys(map).length, 2);
});

nodeTest.test("addModule is immutable - does not modify original", () => {
  const original = moduleMap.createModuleMap();
  const entry: ModuleEntry = {
    id: "./src/New.tsx",
    name: "New",
    chunks: ["new.js"],
  };

  const updated = moduleMap.addModule(original, entry);

  assert.assertEquals(Object.keys(original).length, 0);
  assert.assertEquals(Object.keys(updated).length, 1);
});

nodeTest.test("addModule allows updating existing module", () => {
  let map = moduleMap.createModuleMap();
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

  map = moduleMap.addModule(map, entry1);
  map = moduleMap.addModule(map, entry2);

  assert.assertEquals(Object.keys(map).length, 1);
  assert.assertEquals(map["./src/App.tsx"]?.name, "UpdatedApp");
  assert.assertEquals(map["./src/App.tsx"]?.chunks[0], "new.js");
});

// ============================================================================
// getModule tests
// ============================================================================

nodeTest.test("getModule returns module by ID", () => {
  let map = moduleMap.createModuleMap();
  const entry: ModuleEntry = {
    id: "./src/Counter.tsx",
    name: "Counter",
    chunks: ["counter-chunk.js"],
  };
  map = moduleMap.addModule(map, entry);

  const result = moduleMap.getModule(map, "./src/Counter.tsx");

  assert.assertEquals(result, entry);
});

nodeTest.test("getModule returns undefined for non-existent ID", () => {
  const map = moduleMap.createModuleMap();

  const result = moduleMap.getModule(map, "./src/NotFound.tsx");

  assert.assertEquals(result, undefined);
});

// ============================================================================
// hasModule tests
// ============================================================================

nodeTest.test("hasModule returns true for existing module", () => {
  let map = moduleMap.createModuleMap();
  const entry: ModuleEntry = {
    id: "./src/Button.tsx",
    name: "Button",
    chunks: ["button.js"],
  };
  map = moduleMap.addModule(map, entry);

  assert.assertEquals(moduleMap.hasModule(map, "./src/Button.tsx"), true);
});

nodeTest.test("hasModule returns false for non-existent module", () => {
  const map = moduleMap.createModuleMap();

  assert.assertEquals(moduleMap.hasModule(map, "./src/Missing.tsx"), false);
});

// ============================================================================
// getAllChunks tests
// ============================================================================

nodeTest.test("getAllChunks returns empty array for empty map", () => {
  const map = moduleMap.createModuleMap();

  const chunks = moduleMap.getAllChunks(map);

  assert.assertEquals(chunks, []);
});

nodeTest.test("getAllChunks returns all unique chunks", () => {
  let map = moduleMap.createModuleMap();
  map = moduleMap.addModule(map, {
    id: "./A.tsx",
    name: "A",
    chunks: ["chunk-a.js", "shared.js"],
  });
  map = moduleMap.addModule(map, {
    id: "./B.tsx",
    name: "B",
    chunks: ["chunk-b.js", "vendor.js"],
  });

  const chunks = moduleMap.getAllChunks(map);

  assert.assertEquals(chunks.length, 4);
  assert.assert(chunks.includes("chunk-a.js"));
  assert.assert(chunks.includes("chunk-b.js"));
  assert.assert(chunks.includes("shared.js"));
  assert.assert(chunks.includes("vendor.js"));
});

nodeTest.test("getAllChunks deduplicates chunks across modules", () => {
  let map = moduleMap.createModuleMap();
  map = moduleMap.addModule(map, {
    id: "./A.tsx",
    name: "A",
    chunks: ["common.js", "a.js"],
  });
  map = moduleMap.addModule(map, {
    id: "./B.tsx",
    name: "B",
    chunks: ["common.js", "b.js"],
  });
  map = moduleMap.addModule(map, {
    id: "./C.tsx",
    name: "C",
    chunks: ["common.js", "c.js"],
  });

  const chunks = moduleMap.getAllChunks(map);

  // common.js should only appear once
  assert.assertEquals(chunks.filter((c) => c === "common.js").length, 1);
  assert.assertEquals(chunks.length, 4); // common, a, b, c
});

nodeTest.test("getAllChunks handles modules with overlapping chunks", () => {
  let map = moduleMap.createModuleMap();
  map = moduleMap.addModule(map, {
    id: "./A.tsx",
    name: "A",
    chunks: ["vendor.js", "react.js"],
  });
  map = moduleMap.addModule(map, {
    id: "./B.tsx",
    name: "B",
    chunks: ["vendor.js", "react.js", "extra.js"],
  });

  const chunks = moduleMap.getAllChunks(map);

  assert.assertEquals(chunks.length, 3); // vendor, react, extra
  assert.assertEquals(chunks.filter((c) => c === "vendor.js").length, 1);
  assert.assertEquals(chunks.filter((c) => c === "react.js").length, 1);
});

nodeTest.test("getAllChunks handles single module", () => {
  let map = moduleMap.createModuleMap();
  map = moduleMap.addModule(map, {
    id: "./Single.tsx",
    name: "Single",
    chunks: ["single.js"],
  });

  const chunks = moduleMap.getAllChunks(map);

  assert.assertEquals(chunks, ["single.js"]);
});

nodeTest.test("getAllChunks handles module with multiple chunks", () => {
  let map = moduleMap.createModuleMap();
  map = moduleMap.addModule(map, {
    id: "./Large.tsx",
    name: "Large",
    chunks: ["chunk1.js", "chunk2.js", "chunk3.js", "chunk4.js"],
  });

  const chunks = moduleMap.getAllChunks(map);

  assert.assertEquals(chunks.length, 4);
});
