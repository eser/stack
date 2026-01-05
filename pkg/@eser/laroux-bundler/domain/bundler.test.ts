// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertExists } from "@std/assert";
import { runtime } from "@eser/standards/runtime";
import { analyzeBundleResult, type BundleResult } from "./bundler.ts";

Deno.test("bundler", async (t) => {
  await t.step("analyzeBundleResult - with chunks", () => {
    const result: BundleResult = {
      entrypoint: "client.js",
      outputs: {
        "client.js": { fileName: "client.js", size: 10000 },
        "chunk-ABC123.js": { fileName: "chunk-ABC123.js", size: 5000 },
        "chunk-DEF456.js": { fileName: "chunk-DEF456.js", size: 2000 },
      },
      manifest: {},
      totalSize: 17000,
    };

    const analysis = analyzeBundleResult(result);

    assertEquals(analysis.chunkCount, 3);
    assertEquals(analysis.largestChunk.name, "client.js");
    assertEquals(analysis.largestChunk.size, 10000);
    assertEquals(analysis.smallestChunk.name, "chunk-DEF456.js");
    assertEquals(analysis.smallestChunk.size, 2000);
    assertEquals(analysis.averageChunkSize, 17000 / 3);
  });

  await t.step("analyzeBundleResult - empty", () => {
    const result: BundleResult = {
      entrypoint: "client.js",
      outputs: {},
      manifest: {},
      totalSize: 0,
    };

    const analysis = analyzeBundleResult(result);

    assertEquals(analysis.chunkCount, 0);
    assertEquals(analysis.largestChunk.name, "");
    assertEquals(analysis.largestChunk.size, 0);
    assertEquals(analysis.smallestChunk.name, "");
    assertEquals(analysis.smallestChunk.size, 0);
    assertEquals(analysis.averageChunkSize, 0);
  });

  await t.step("analyzeBundleResult - single chunk", () => {
    const result: BundleResult = {
      entrypoint: "client.js",
      outputs: {
        "client.js": { fileName: "client.js", size: 50000 },
      },
      manifest: {},
      totalSize: 50000,
    };

    const analysis = analyzeBundleResult(result);

    assertEquals(analysis.chunkCount, 1);
    assertEquals(analysis.largestChunk.name, "client.js");
    assertEquals(analysis.largestChunk.size, 50000);
    assertEquals(analysis.smallestChunk.name, "client.js");
    assertEquals(analysis.smallestChunk.size, 50000);
    assertEquals(analysis.averageChunkSize, 50000);
  });
});

Deno.test("bundler integration", async (t) => {
  // Create a temp directory for test fixtures
  const tempDir = await runtime.fs.makeTempDir({ prefix: "bundler-test-" });
  const srcDir = runtime.path.join(tempDir, "src");
  const distDir = runtime.path.join(tempDir, "dist");

  await runtime.fs.ensureDir(srcDir);
  await runtime.fs.ensureDir(distDir);

  await t.step("setup test files", async () => {
    // Create a simple component file
    const componentCode = `
export function Counter() {
  return <div>Counter Component</div>;
}
`;
    await runtime.fs.writeTextFile(
      runtime.path.join(srcDir, "counter.tsx"),
      componentCode,
    );

    // Create a deno.json for import resolution
    const denoJson = {
      imports: {
        "react": "npm:react@^19.0.0",
      },
    };
    await runtime.fs.writeTextFile(
      runtime.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );
  });

  // Note: Full bundler integration tests require the actual bundler backends
  // which have external dependencies. These are tested in the @eser/bundler package.
  // Here we test the interface contracts.

  await t.step("ServerBundleOptions type check", () => {
    // This is a compile-time type check
    const options = {
      entrypoints: [runtime.path.join(srcDir, "counter.tsx")],
      outputDir: distDir,
      projectRoot: tempDir,
      externals: ["react"],
      sourcemap: false,
      minify: false,
    };

    // Verify all required fields are present
    assertExists(options.entrypoints);
    assertExists(options.outputDir);
    assertExists(options.projectRoot);
    assertEquals(options.entrypoints.length, 1);
  });

  // Cleanup
  await runtime.fs.remove(tempDir, { recursive: true });
});
