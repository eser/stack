// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as chunkManifest from "./chunk-manifest.ts";
import type { BundleResult } from "./bundler.ts";
import type { ClientComponent } from "./framework-plugin.ts";

const counter: ClientComponent = {
  filePath: "/app/src/app/counter.tsx",
  relativePath: "src/app/counter.tsx",
  exportNames: ["Counter"],
};

function bundleResultWith(manifest: Record<string, string[]>): BundleResult {
  return {
    entrypoint: "client.js",
    outputs: {
      "client.js": { fileName: "client.js", size: 1000 },
      "chunk-ABC123.js": { fileName: "chunk-ABC123.js", size: 400 },
    },
    manifest,
    totalSize: 1400,
  };
}

Deno.test("chunk-manifest", async (t) => {
  await t.step("generateChunkManifest maps a component to its chunks", () => {
    const manifest = chunkManifest.generateChunkManifest(
      "build-1",
      0,
      bundleResultWith({ [counter.filePath]: ["chunk-ABC123.js"] }),
      [counter],
    );

    assert.assertEquals(manifest.chunks["src/app/counter.tsx"], {
      main: "ABC123",
      deps: [],
      size: 400,
      exportName: "Counter",
    });
  });

  await t.step(
    "generateChunkManifest throws ChunkManifestError for a component without chunks",
    () => {
      const error = assert.assertThrows(
        () =>
          chunkManifest.generateChunkManifest(
            "build-1",
            0,
            bundleResultWith({ "/app/src/app/other.tsx": ["chunk-ABC123.js"] }),
            [counter],
          ),
        chunkManifest.ChunkManifestError,
      );

      assert.assertEquals(error.problems, [counter.filePath]);
      assert.assertEquals(error.available, ["/app/src/app/other.tsx"]);
      assert.assertStringIncludes(error.message, "src/app/counter.tsx");
    },
  );

  await t.step(
    "generateChunkManifest throws ChunkManifestError for a chunk missing from the outputs",
    () => {
      const error = assert.assertThrows(
        () =>
          chunkManifest.generateChunkManifest(
            "build-1",
            0,
            bundleResultWith({ [counter.filePath]: ["chunk-MISSING.js"] }),
            [counter],
          ),
        chunkManifest.ChunkManifestError,
      );

      assert.assertEquals(error.problems.length, 1);
      assert.assertStringIncludes(error.message, "chunk-MISSING.js");
      assert.assertEquals(error.available, ["client.js", "chunk-ABC123.js"]);
    },
  );
});
