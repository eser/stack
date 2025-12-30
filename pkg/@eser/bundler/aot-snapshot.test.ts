// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as standardsRuntime from "@eser/standards/runtime";
import {
  AotSnapshot,
  type AotSnapshotState as _AotSnapshotState,
  createAotSnapshotState,
  loadAotSnapshot,
} from "./aot-snapshot.ts";

// ============================================================================
// Test helpers
// ============================================================================

const createTestContext = async () => {
  const tempDir = await standardsRuntime.runtime.fs.makeTempDir({
    prefix: "aot-snapshot-test-",
  });
  return {
    tempDir,
    cleanup: async () => {
      try {
        await standardsRuntime.runtime.fs.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
};

// ============================================================================
// createAotSnapshotState tests
// ============================================================================

Deno.test("createAotSnapshotState creates state with files and dependencies", () => {
  const files = new Map([
    ["main.js", "/path/to/main.js"],
    ["chunk-abc.js", "/path/to/chunk-abc.js"],
  ]);
  const dependencies = new Map([
    ["main.js", ["chunk-abc.js"]],
  ]);

  const state = createAotSnapshotState(files, dependencies);

  assert.assertEquals(state.files, files);
  assert.assertEquals(state.dependencyMapping, dependencies);
});

Deno.test("createAotSnapshotState creates state with empty maps", () => {
  const files = new Map<string, string>();
  const dependencies = new Map<string, Array<string>>();

  const state = createAotSnapshotState(files, dependencies);

  assert.assertEquals(state.files.size, 0);
  assert.assertEquals(state.dependencyMapping.size, 0);
});

// ============================================================================
// AotSnapshot.paths tests
// ============================================================================

Deno.test("AotSnapshot.paths returns all file paths", () => {
  const files = new Map([
    ["main.js", "/path/main.js"],
    ["vendor.js", "/path/vendor.js"],
    ["chunk-123.js", "/path/chunk-123.js"],
  ]);
  const state = createAotSnapshotState(files, new Map());
  const snapshot = new AotSnapshot(state);

  const paths = snapshot.paths;

  assert.assertEquals(paths.length, 3);
  assert.assert(paths.includes("main.js"));
  assert.assert(paths.includes("vendor.js"));
  assert.assert(paths.includes("chunk-123.js"));
});

Deno.test("AotSnapshot.paths returns empty array for empty state", () => {
  const state = createAotSnapshotState(new Map(), new Map());
  const snapshot = new AotSnapshot(state);

  const paths = snapshot.paths;

  assert.assertEquals(paths.length, 0);
});

// ============================================================================
// AotSnapshot.read tests
// ============================================================================

Deno.test("AotSnapshot.read returns ReadableStream for existing file", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const testFilePath = standardsRuntime.runtime.path.join(
      tempDir,
      "test.js",
    );
    const testContent = 'console.log("hello");';
    await standardsRuntime.runtime.fs.writeTextFile(testFilePath, testContent);

    const files = new Map([["test.js", testFilePath]]);
    const state = createAotSnapshotState(files, new Map());
    const snapshot = new AotSnapshot(state);

    const stream = await snapshot.read("test.js");

    assert.assertExists(stream);
    assert.assertInstanceOf(stream, ReadableStream);

    // Read the stream content
    const reader = stream.getReader();
    const { value } = await reader.read();
    const content = new TextDecoder().decode(value);

    assert.assertEquals(content, testContent);
  } finally {
    await cleanup();
  }
});

Deno.test("AotSnapshot.read returns null for non-existent path", async () => {
  const state = createAotSnapshotState(new Map(), new Map());
  const snapshot = new AotSnapshot(state);

  const stream = await snapshot.read("non-existent.js");

  assert.assertEquals(stream, null);
});

Deno.test("AotSnapshot.read returns null when file is deleted", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const testFilePath = standardsRuntime.runtime.path.join(
      tempDir,
      "deleted.js",
    );
    await standardsRuntime.runtime.fs.writeTextFile(testFilePath, "content");

    const files = new Map([["deleted.js", testFilePath]]);
    const state = createAotSnapshotState(files, new Map());
    const snapshot = new AotSnapshot(state);

    // Delete the file
    await standardsRuntime.runtime.fs.remove(testFilePath);

    const stream = await snapshot.read("deleted.js");

    assert.assertEquals(stream, null);
  } finally {
    await cleanup();
  }
});

// ============================================================================
// AotSnapshot.dependencies tests
// ============================================================================

Deno.test("AotSnapshot.dependencies returns dependencies for known path", () => {
  const dependencies = new Map([
    ["main.js", ["chunk-a.js", "chunk-b.js"]],
    ["chunk-a.js", ["vendor.js"]],
  ]);
  const state = createAotSnapshotState(new Map(), dependencies);
  const snapshot = new AotSnapshot(state);

  const deps = snapshot.dependencies("main.js");

  assert.assertEquals(deps.length, 2);
  assert.assert(deps.includes("chunk-a.js"));
  assert.assert(deps.includes("chunk-b.js"));
});

Deno.test("AotSnapshot.dependencies returns empty array for unknown path", () => {
  const dependencies = new Map([
    ["main.js", ["chunk-a.js"]],
  ]);
  const state = createAotSnapshotState(new Map(), dependencies);
  const snapshot = new AotSnapshot(state);

  const deps = snapshot.dependencies("unknown.js");

  assert.assertEquals(deps.length, 0);
});

Deno.test("AotSnapshot.dependencies returns empty array when no dependencies", () => {
  const dependencies = new Map([
    ["main.js", []],
  ]);
  const state = createAotSnapshotState(new Map(), dependencies);
  const snapshot = new AotSnapshot(state);

  const deps = snapshot.dependencies("main.js");

  assert.assertEquals(deps.length, 0);
});

// ============================================================================
// loadAotSnapshot tests
// ============================================================================

Deno.test("loadAotSnapshot loads valid snapshot from directory", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    // Create snapshot.json
    const snapshotData = {
      build_id: "test-build-id-12345",
      files: {
        "main.js": ["chunk-a.js"],
        "chunk-a.js": [],
      },
    };
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(tempDir, "snapshot.json"),
      JSON.stringify(snapshotData),
    );

    // Create the actual files
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(tempDir, "main.js"),
      "// main.js content",
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(tempDir, "chunk-a.js"),
      "// chunk-a.js content",
    );

    const snapshot = await loadAotSnapshot(tempDir);

    assert.assertExists(snapshot);
    assert.assertEquals(snapshot?.paths.length, 2);
    assert.assert(snapshot?.paths.includes("main.js"));
  } finally {
    await cleanup();
  }
});

Deno.test("loadAotSnapshot returns null for non-existent directory", async () => {
  const snapshot = await loadAotSnapshot("/non/existent/path");

  assert.assertEquals(snapshot, null);
});

Deno.test("loadAotSnapshot returns null for file path instead of directory", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const filePath = standardsRuntime.runtime.path.join(tempDir, "file.txt");
    await standardsRuntime.runtime.fs.writeTextFile(filePath, "content");

    const snapshot = await loadAotSnapshot(filePath);

    assert.assertEquals(snapshot, null);
  } finally {
    await cleanup();
  }
});

Deno.test("loadAotSnapshot sets build ID from snapshot", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const expectedBuildId = "snapshot-build-id-abc123";
    const snapshotData = {
      build_id: expectedBuildId,
      files: {
        "app.js": [],
      },
    };
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(tempDir, "snapshot.json"),
      JSON.stringify(snapshotData),
    );
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(tempDir, "app.js"),
      "// app.js",
    );

    const snapshot = await loadAotSnapshot(tempDir);

    assert.assertExists(snapshot);

    // The build ID should be set - we can verify by checking getBuildId
    const { getBuildId } = await import("./build-id.ts");
    const buildId = await getBuildId();
    assert.assertEquals(buildId, expectedBuildId);
  } finally {
    await cleanup();
  }
});

Deno.test("loadAotSnapshot loads dependencies correctly", async () => {
  const { tempDir, cleanup } = await createTestContext();

  try {
    const snapshotData = {
      build_id: "deps-test-build",
      files: {
        "entry.js": ["chunk-1.js", "chunk-2.js"],
        "chunk-1.js": ["vendor.js"],
        "chunk-2.js": [],
        "vendor.js": [],
      },
    };
    await standardsRuntime.runtime.fs.writeTextFile(
      standardsRuntime.runtime.path.join(tempDir, "snapshot.json"),
      JSON.stringify(snapshotData),
    );

    // Create all files
    for (const file of Object.keys(snapshotData.files)) {
      await standardsRuntime.runtime.fs.writeTextFile(
        standardsRuntime.runtime.path.join(tempDir, file),
        `// ${file}`,
      );
    }

    const snapshot = await loadAotSnapshot(tempDir);

    assert.assertExists(snapshot);

    const entryDeps = snapshot?.dependencies("entry.js") ?? [];
    assert.assertEquals(entryDeps.length, 2);
    assert.assert(entryDeps.includes("chunk-1.js"));
    assert.assert(entryDeps.includes("chunk-2.js"));

    const chunk1Deps = snapshot?.dependencies("chunk-1.js") ?? [];
    assert.assertEquals(chunk1Deps.length, 1);
    assert.assert(chunk1Deps.includes("vendor.js"));

    const chunk2Deps = snapshot?.dependencies("chunk-2.js") ?? [];
    assert.assertEquals(chunk2Deps.length, 0);
  } finally {
    await cleanup();
  }
});
