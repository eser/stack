// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  type ClientComponentInfo,
  extractDependencies,
  generateChunkManifest,
  generateChunkManifestWithMeta,
  generateModuleMap,
  generateModuleMapFromIds,
  generateRSCChunkManifest,
  getChunkPaths,
  getEntryPoints,
  getTotalBundleSize,
} from "./manifest.ts";
import type { BundleMetafile, BundleOutput, BundleResult } from "./types.ts";

// ============================================================================
// Test helpers
// ============================================================================

function createMockBundleOutput(
  overrides: Partial<BundleOutput> = {},
): BundleOutput {
  return {
    path: overrides.path ?? "chunk.js",
    code: overrides.code ?? new Uint8Array([]),
    size: overrides.size ?? 1000,
    hash: overrides.hash ?? "abc123",
    isEntry: overrides.isEntry ?? false,
    ...overrides,
  };
}

function createMockBundleResult(options: {
  outputs?: Array<[string, Partial<BundleOutput>]>;
  entrypointManifest?: Record<string, string[]>;
  metafile?: BundleMetafile;
  entrypoint?: string;
}): BundleResult {
  const outputs = new Map<string, BundleOutput>();

  for (const [name, output] of options.outputs ?? []) {
    outputs.set(name, createMockBundleOutput({ path: name, ...output }));
  }

  return {
    success: true,
    outputs,
    errors: [],
    warnings: [],
    entrypointManifest: options.entrypointManifest,
    metafile: options.metafile,
    entrypoint: options.entrypoint,
  };
}

// ============================================================================
// generateModuleMap tests
// ============================================================================

Deno.test("generateModuleMap creates module map from client components", () => {
  const result = createMockBundleResult({
    outputs: [["main.js", { size: 100 }]],
    entrypointManifest: {
      "/src/counter.tsx": ["chunk-abc.js"],
    },
  });

  const components: ClientComponentInfo[] = [
    {
      filePath: "/src/counter.tsx",
      relativePath: "src/counter.tsx",
      exportNames: ["Counter"],
    },
  ];

  const moduleMap = generateModuleMap(result, components);

  assert.assertExists(moduleMap["./src/counter.tsx"]);
  assert.assertEquals(moduleMap["./src/counter.tsx"]?.name, "Counter");
  assert.assertEquals(
    moduleMap["./src/counter.tsx"]?.chunks,
    ["chunk-abc.js"],
  );
});

Deno.test("generateModuleMap uses relative path as key", () => {
  const result = createMockBundleResult({
    entrypointManifest: { "/project/src/App.tsx": ["app.js"] },
  });

  const components: ClientComponentInfo[] = [
    {
      filePath: "/project/src/App.tsx",
      relativePath: "src/App.tsx",
      exportNames: ["App"],
    },
  ];

  const moduleMap = generateModuleMap(result, components);

  assert.assertExists(moduleMap["./src/App.tsx"]);
});

Deno.test("generateModuleMap uses first export name", () => {
  const result = createMockBundleResult({
    entrypointManifest: { "/src/multi.tsx": ["multi.js"] },
  });

  const components: ClientComponentInfo[] = [
    {
      filePath: "/src/multi.tsx",
      relativePath: "src/multi.tsx",
      exportNames: ["ComponentA", "ComponentB"],
    },
  ];

  const moduleMap = generateModuleMap(result, components);

  assert.assertEquals(moduleMap["./src/multi.tsx"]?.name, "ComponentA");
});

Deno.test("generateModuleMap falls back to .js path when no manifest entry", () => {
  const result = createMockBundleResult({
    entrypointManifest: {},
  });

  const components: ClientComponentInfo[] = [
    {
      filePath: "/src/missing.tsx",
      relativePath: "src/missing.tsx",
      exportNames: ["Missing"],
    },
  ];

  const moduleMap = generateModuleMap(result, components);

  assert.assertEquals(
    moduleMap["./src/missing.tsx"]?.chunks,
    ["src/missing.js"],
  );
});

// ============================================================================
// generateModuleMapFromIds tests
// ============================================================================

Deno.test("generateModuleMapFromIds creates module map from ID map", () => {
  const result = createMockBundleResult({
    entrypointManifest: { "mod-1": ["chunk-1.js"] },
  });

  const moduleIds = new Map([["mod-1", "ModuleOne"]]);

  const moduleMap = generateModuleMapFromIds(result, moduleIds);

  assert.assertExists(moduleMap["mod-1"]);
  assert.assertEquals(moduleMap["mod-1"]?.name, "ModuleOne");
});

Deno.test("generateModuleMapFromIds includes chunks from manifest", () => {
  const result = createMockBundleResult({
    entrypointManifest: {
      "mod-a": ["chunk-a.js", "vendor.js"],
    },
  });

  const moduleIds = new Map([["mod-a", "ModA"]]);

  const moduleMap = generateModuleMapFromIds(result, moduleIds);

  assert.assertEquals(
    moduleMap["mod-a"]?.chunks,
    ["chunk-a.js", "vendor.js"],
  );
});

// ============================================================================
// generateChunkManifest tests
// ============================================================================

Deno.test("generateChunkManifest creates manifest with correct entrypoint", () => {
  const result = createMockBundleResult({
    outputs: [["main.js", { size: 100, hash: "h1" }]],
  });

  const manifest = generateChunkManifest(result, "main.js", "build-123");

  assert.assertEquals(manifest.entrypoint, "main.js");
  assert.assertEquals(manifest.buildId, "build-123");
});

Deno.test("generateChunkManifest includes all output chunks", () => {
  const result = createMockBundleResult({
    outputs: [
      ["chunk-a.js", { size: 100, hash: "ha" }],
      ["chunk-b.js", { size: 200, hash: "hb" }],
    ],
  });

  const manifest = generateChunkManifest(result, "main.js", "build-123");

  assert.assertExists(manifest.chunks["chunk-a.js"]);
  assert.assertExists(manifest.chunks["chunk-b.js"]);
  assert.assertEquals(manifest.chunks["chunk-a.js"]?.size, 100);
  assert.assertEquals(manifest.chunks["chunk-b.js"]?.size, 200);
});

Deno.test("generateChunkManifest includes timestamp", () => {
  const before = Date.now();
  const result = createMockBundleResult({ outputs: [] });

  const manifest = generateChunkManifest(result, "main.js", "build-123");
  const after = Date.now();

  assert.assert(manifest.timestamp >= before);
  assert.assert(manifest.timestamp <= after);
});

// ============================================================================
// generateChunkManifestWithMeta tests
// ============================================================================

Deno.test("generateChunkManifestWithMeta includes isEntry flag", () => {
  const result = createMockBundleResult({
    outputs: [
      ["main.js", { isEntry: true }],
      ["vendor.js", { isEntry: false }],
    ],
  });

  const manifest = generateChunkManifestWithMeta(result, "main.js", "id");

  assert.assertEquals(manifest.chunks["main.js"]?.isEntry, true);
  assert.assertEquals(manifest.chunks["vendor.js"]?.isEntry, false);
});

Deno.test("generateChunkManifestWithMeta calculates totalSize", () => {
  const result = createMockBundleResult({
    outputs: [
      ["a.js", { size: 100 }],
      ["b.js", { size: 200 }],
      ["c.js", { size: 300 }],
    ],
  });

  const manifest = generateChunkManifestWithMeta(result, "main.js", "id");

  assert.assertEquals(manifest.totalSize, 600);
});

Deno.test("generateChunkManifestWithMeta includes version and environment", () => {
  const result = createMockBundleResult({ outputs: [] });

  const manifest = generateChunkManifestWithMeta(result, "main.js", "id", {
    version: "1.0.0",
    environment: "production",
  });

  assert.assertEquals(manifest.version, "1.0.0");
  assert.assertEquals(manifest.environment, "production");
});

// ============================================================================
// extractDependencies tests
// ============================================================================

Deno.test("extractDependencies returns empty array for non-existent output", () => {
  const metafile: BundleMetafile = {
    inputs: {},
    outputs: {},
  };

  const deps = extractDependencies(metafile, "missing.js");

  assert.assertEquals(deps, []);
});

Deno.test("extractDependencies extracts import paths from metafile", () => {
  const metafile: BundleMetafile = {
    inputs: {},
    outputs: {
      "main.js": {
        bytes: 100,
        inputs: { "src/main.ts": { bytesInOutput: 100 } },
        imports: [{ path: "vendor.js", kind: "import-statement" }],
        entryPoint: "src/main.ts",
      },
    },
  };

  const deps = extractDependencies(metafile, "main.js");

  assert.assertEquals(deps, ["vendor.js"]);
});

// ============================================================================
// getEntryPoints tests
// ============================================================================

Deno.test("getEntryPoints returns only entry chunks", () => {
  const result = createMockBundleResult({
    outputs: [
      ["main.js", { isEntry: true }],
      ["vendor.js", { isEntry: false }],
      ["app.js", { isEntry: true }],
    ],
  });

  const entries = getEntryPoints(result);

  assert.assertEquals(entries.length, 2);
  assert.assert(entries.includes("main.js"));
  assert.assert(entries.includes("app.js"));
  assert.assertEquals(entries.includes("vendor.js"), false);
});

Deno.test("getEntryPoints returns empty array when no entries", () => {
  const result = createMockBundleResult({
    outputs: [["chunk.js", { isEntry: false }]],
  });

  const entries = getEntryPoints(result);

  assert.assertEquals(entries.length, 0);
});

// ============================================================================
// getChunkPaths tests
// ============================================================================

Deno.test("getChunkPaths returns all output paths", () => {
  const result = createMockBundleResult({
    outputs: [
      ["main.js", {}],
      ["vendor.js", {}],
      ["chunk-abc.js", {}],
    ],
  });

  const paths = getChunkPaths(result);

  assert.assertEquals(paths.length, 3);
  assert.assert(paths.includes("main.js"));
  assert.assert(paths.includes("vendor.js"));
  assert.assert(paths.includes("chunk-abc.js"));
});

// ============================================================================
// getTotalBundleSize tests
// ============================================================================

Deno.test("getTotalBundleSize returns 0 for empty outputs", () => {
  const result = createMockBundleResult({ outputs: [] });

  const size = getTotalBundleSize(result);

  assert.assertEquals(size, 0);
});

Deno.test("getTotalBundleSize sums all output sizes", () => {
  const result = createMockBundleResult({
    outputs: [
      ["a.js", { size: 100 }],
      ["b.js", { size: 200 }],
      ["c.js", { size: 300 }],
    ],
  });

  const size = getTotalBundleSize(result);

  assert.assertEquals(size, 600);
});

// ============================================================================
// generateRSCChunkManifest tests
// ============================================================================

Deno.test("generateRSCChunkManifest creates manifest with version and buildId", () => {
  const result = createMockBundleResult({ outputs: [] });

  const manifest = generateRSCChunkManifest(result, [], "build-abc");

  assert.assertEquals(manifest.version, "1.0");
  assert.assertEquals(manifest.buildId, "build-abc");
});

Deno.test("generateRSCChunkManifest includes file info", () => {
  const result = createMockBundleResult({
    outputs: [
      ["chunk-abc.js", { size: 100, hash: "hash1" }],
    ],
  });

  const manifest = generateRSCChunkManifest(result, [], "build");

  assert.assertExists(manifest.files["chunk-abc.js"]);
  assert.assertEquals(manifest.files["chunk-abc.js"]?.size, 100);
  assert.assertEquals(manifest.files["chunk-abc.js"]?.hash, "hash1");
});

Deno.test("generateRSCChunkManifest maps components to chunks", () => {
  const result = createMockBundleResult({
    outputs: [["chunk-xyz.js", { size: 50 }]],
    entrypointManifest: {
      "/src/Button.tsx": ["chunk-xyz.js"],
    },
  });

  const components: ClientComponentInfo[] = [
    {
      filePath: "/src/Button.tsx",
      relativePath: "src/Button.tsx",
      exportNames: ["Button"],
    },
  ];

  const manifest = generateRSCChunkManifest(result, components, "build");

  assert.assertExists(manifest.chunks["src/Button.tsx"]);
  assert.assertEquals(manifest.chunks["src/Button.tsx"]?.main, "xyz");
});

Deno.test("generateRSCChunkManifest strips chunk decorations from IDs", () => {
  const result = createMockBundleResult({
    outputs: [["chunk-ABC123.js", { size: 100 }]],
    entrypointManifest: {
      "/src/App.tsx": ["chunk-ABC123.js"],
    },
  });

  const components: ClientComponentInfo[] = [
    {
      filePath: "/src/App.tsx",
      relativePath: "src/App.tsx",
      exportNames: ["default"],
    },
  ];

  const manifest = generateRSCChunkManifest(result, components, "build");

  assert.assertEquals(manifest.chunks["src/App.tsx"]?.main, "ABC123");
});

Deno.test("generateRSCChunkManifest only includes exportName when not default", () => {
  const result = createMockBundleResult({
    entrypointManifest: {
      "/src/Named.tsx": ["chunk-a.js"],
      "/src/Default.tsx": ["chunk-b.js"],
    },
  });

  const components: ClientComponentInfo[] = [
    {
      filePath: "/src/Named.tsx",
      relativePath: "src/Named.tsx",
      exportNames: ["NamedExport"],
    },
    {
      filePath: "/src/Default.tsx",
      relativePath: "src/Default.tsx",
      exportNames: ["default"],
    },
  ];

  const manifest = generateRSCChunkManifest(result, components, "build");

  assert.assertEquals(
    manifest.chunks["src/Named.tsx"]?.exportName,
    "NamedExport",
  );
  assert.assertEquals(
    manifest.chunks["src/Default.tsx"]?.exportName,
    undefined,
  );
});
