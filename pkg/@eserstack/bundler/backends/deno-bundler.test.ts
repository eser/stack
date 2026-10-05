// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as base64 from "@std/encoding/base64";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as denoBundler from "./deno-bundler.ts";
import type { DenoBundlerBackendOptions } from "./deno-bundler.ts";

const withTempDir = async (
  fn: (tempDir: string) => Promise<void>,
): Promise<void> => {
  const tempDir = await crossRuntime.runtime.fs.makeTempDir({
    prefix: "deno-bundler-test-",
  });
  try {
    await fn(tempDir);
  } finally {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  }
};

// ============================================================================
// DenoBundlerBackend constructor tests
// ============================================================================

Deno.test("DenoBundlerBackend has correct name", () => {
  const backend = new denoBundler.DenoBundlerBackend();

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts empty options", () => {
  const backend = new denoBundler.DenoBundlerBackend({});

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts buildId option", () => {
  const options: DenoBundlerBackendOptions = {
    buildId: "custom-build-123",
  };

  const backend = new denoBundler.DenoBundlerBackend(options);

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts entryName option", () => {
  const options: DenoBundlerBackendOptions = {
    entryName: "app",
  };

  const backend = new denoBundler.DenoBundlerBackend(options);

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts all options", () => {
  const options: DenoBundlerBackendOptions = {
    buildId: "prod-build-v1.0.0",
    entryName: "client",
  };

  const backend = new denoBundler.DenoBundlerBackend(options);

  assert.assertEquals(backend.name, "deno-bundler");
});

// ============================================================================
// createDenoBundlerBackend factory tests
// ============================================================================

Deno.test("createDenoBundlerBackend creates backend instance", () => {
  const backend = denoBundler.createDenoBundlerBackend();

  assert.assertInstanceOf(backend, denoBundler.DenoBundlerBackend);
  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("createDenoBundlerBackend accepts empty options", () => {
  const backend = denoBundler.createDenoBundlerBackend({});

  assert.assertInstanceOf(backend, denoBundler.DenoBundlerBackend);
});

Deno.test("createDenoBundlerBackend accepts buildId option", () => {
  const backend = denoBundler.createDenoBundlerBackend({
    buildId: "test-build-id",
  });

  assert.assertInstanceOf(backend, denoBundler.DenoBundlerBackend);
});

Deno.test("createDenoBundlerBackend accepts entryName option", () => {
  const backend = denoBundler.createDenoBundlerBackend({
    entryName: "custom-entry",
  });

  assert.assertInstanceOf(backend, denoBundler.DenoBundlerBackend);
});

Deno.test("createDenoBundlerBackend accepts all options", () => {
  const backend = denoBundler.createDenoBundlerBackend({
    buildId: "release-123",
    entryName: "bundle",
  });

  assert.assertInstanceOf(backend, denoBundler.DenoBundlerBackend);
});

// ============================================================================
// DenoBundlerBackend interface compliance tests
// ============================================================================

Deno.test("DenoBundlerBackend implements Bundler interface", () => {
  const backend = new denoBundler.DenoBundlerBackend();

  // Check that required methods exist
  assert.assertEquals(typeof backend.bundle, "function");
  assert.assertEquals(typeof backend.watch, "function");
  assert.assertEquals(typeof backend.name, "string");
});

Deno.test("DenoBundlerBackend.bundle is async function", () => {
  const backend = new denoBundler.DenoBundlerBackend();

  // Verify bundle returns a Promise (async function)
  assert.assertEquals(backend.bundle.constructor.name, "AsyncFunction");
});

Deno.test("DenoBundlerBackend.watch returns Promise", () => {
  const backend = new denoBundler.DenoBundlerBackend();

  // watch should return a Promise
  // We can't actually call it without proper config, but we can verify the method exists
  assert.assertEquals(typeof backend.watch, "function");
});

// ============================================================================
// Options validation tests
// ============================================================================

Deno.test("DenoBundlerBackend buildId can be empty string", () => {
  const backend = new denoBundler.DenoBundlerBackend({ buildId: "" });

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend entryName can be empty string", () => {
  const backend = new denoBundler.DenoBundlerBackend({ entryName: "" });

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts Unicode in buildId", () => {
  const backend = new denoBundler.DenoBundlerBackend({
    buildId: "build-日本語-🚀",
  });

  assert.assertEquals(backend.name, "deno-bundler");
});

Deno.test("DenoBundlerBackend accepts special characters in entryName", () => {
  const backend = new denoBundler.DenoBundlerBackend({
    entryName: "app-entry_v2",
  });

  assert.assertEquals(backend.name, "deno-bundler");
});

// ============================================================================
// Factory function consistency tests
// ============================================================================

Deno.test("createDenoBundlerBackend with no args equals empty object", () => {
  const backend1 = denoBundler.createDenoBundlerBackend();
  const backend2 = denoBundler.createDenoBundlerBackend({});

  assert.assertEquals(backend1.name, backend2.name);
});

Deno.test("createDenoBundlerBackend creates independent instances", () => {
  const backend1 = denoBundler.createDenoBundlerBackend({ buildId: "build-1" });
  const backend2 = denoBundler.createDenoBundlerBackend({ buildId: "build-2" });

  // Each call should create a new instance
  assert.assertNotStrictEquals(backend1, backend2);
});

Deno.test("Multiple DenoBundlerBackend instances are independent", () => {
  const backend1 = new denoBundler.DenoBundlerBackend({ buildId: "a" });
  const backend2 = new denoBundler.DenoBundlerBackend({ buildId: "b" });

  assert.assertNotStrictEquals(backend1, backend2);
  assert.assertEquals(backend1.name, backend2.name);
});

// ============================================================================
// DenoBundlerBackend.bundle integration tests (runs the real Deno.bundle)
// ============================================================================

const CHUNK_NAME = /^chunk-[A-Z0-9]+\.js$/;

/** A file URL for a path on the local file system, for a dynamic import. */
const toFileUrl = (filePath: string): string => {
  const slashed = filePath.replaceAll("\\", "/");
  return new URL(`file://${slashed.startsWith("/") ? "" : "/"}${slashed}`)
    .href;
};

/**
 * Writes a small app: two components sharing a module under src/, and a main
 * entry under dist/ that imports one and loads the other on demand. The two
 * directories make Deno.bundle() lay its outputs out under their parent.
 */
const writeFixture = async (tempDir: string) => {
  const path = crossRuntime.runtime.path;
  const srcDir = path.join(tempDir, "src");
  const distDir = path.join(tempDir, "dist");
  await crossRuntime.runtime.fs.mkdir(srcDir, { recursive: true });
  await crossRuntime.runtime.fs.mkdir(distDir, { recursive: true });

  const files = {
    shared: path.join(srcDir, "shared.ts"),
    app: path.join(srcDir, "app.ts"),
    widget: path.join(srcDir, "widget.ts"),
    client: path.join(distDir, "_client-entry.ts"),
  };

  await crossRuntime.runtime.fs.writeTextFile(
    files.shared,
    "declare const __APP_MODE__: string;\n" +
      "export const mode = () => __APP_MODE__;\n",
  );
  await crossRuntime.runtime.fs.writeTextFile(
    files.app,
    'import { mode } from "./shared.ts";\n' +
      'export const app = () => [mode(), "/_lime/alive"];\n',
  );
  await crossRuntime.runtime.fs.writeTextFile(
    files.widget,
    'import { mode } from "./shared.ts";\n' +
      "export const widget = () => mode();\n",
  );
  await crossRuntime.runtime.fs.writeTextFile(
    files.client,
    'import { app } from "../src/app.ts";\n' +
      "export const run = async () => {\n" +
      '  const loaded = await import("../src/widget.ts");\n' +
      "  return [...app(), loaded.widget()];\n" +
      "};\n",
  );

  return files;
};

const bundleFixture = async (
  tempDir: string,
  sourcemap: boolean | "inline",
) => {
  const files = await writeFixture(tempDir);
  const outputDir = crossRuntime.runtime.path.join(tempDir, "out");
  const backend = denoBundler.createDenoBundlerBackend({
    buildId: "build-1",
    entryName: "client",
  });

  const result = await backend.bundle({
    entrypoints: {
      client: files.client,
      "src/app.ts": files.app,
      "src/widget.ts": files.widget,
    },
    outputDir,
    format: "esm",
    platform: "browser",
    codeSplitting: true,
    minify: false,
    sourcemap,
    basePath: "/base",
    define: { __APP_MODE__: '"production"' },
  });

  return { files, outputDir, result };
};

Deno.test("DenoBundlerBackend.bundle names outputs after the entry keys", async () => {
  await withTempDir(async (tempDir) => {
    const { files, outputDir, result } = await bundleFixture(tempDir, false);

    assert.assertEquals(result.errors, undefined);
    assert.assertEquals(result.success, true);

    const names = [...result.outputs.keys()];
    const chunks = names.filter((name) => name.startsWith("chunk-"));
    assert.assertEquals(
      names.filter((name) => !name.startsWith("chunk-")).sort(),
      ["build-id.js", "client.js", "src/app.ts.js", "src/widget.ts.js"],
    );
    assert.assert(chunks.length > 0);
    assert.assert(chunks.every((name) => CHUNK_NAME.test(name)));
    assert.assertEquals(result.entrypoint, "client.js");

    const entries = ["build-id.js", "client.js", "src/app.ts.js"];
    for (const name of entries) {
      assert.assertEquals(result.outputs.get(name)?.isEntry, true);
    }
    for (const name of chunks) {
      assert.assertEquals(result.outputs.get(name)?.isEntry, false);
    }

    // The manifest lists each entry's own file, then the chunks it imports.
    const manifest = result.entrypointManifest ?? {};
    assert.assertEquals(
      Object.keys(manifest).sort(),
      [
        files.app,
        files.client,
        files.widget,
      ].sort(),
    );
    for (
      const [entryPath, outputName] of [
        [files.client, "client.js"],
        [files.app, "src/app.ts.js"],
        [files.widget, "src/widget.ts.js"],
      ] as const
    ) {
      const [own, ...imported] = manifest[entryPath] ?? [];
      assert.assertEquals(own, outputName);
      assert.assert(imported.length > 0);
      assert.assert(imported.every((name) => chunks.includes(name)));
    }

    // The written files import each other under their new names.
    const widget = await import(
      toFileUrl(crossRuntime.runtime.path.join(outputDir, "src/widget.ts.js"))
    );
    assert.assertEquals(widget.widget(), "production");
    const client = await import(
      toFileUrl(crossRuntime.runtime.path.join(outputDir, "client.js"))
    );
    assert.assertEquals(await client.run(), [
      "production",
      "/base/_lime/alive",
      "production",
    ]);
    const buildId = await import(
      toFileUrl(crossRuntime.runtime.path.join(outputDir, "build-id.js"))
    );
    assert.assertEquals(buildId.BUILD_ID, "build-1");

    const decoder = new TextDecoder();
    const codes = [...result.outputs.values()].map((output) =>
      decoder.decode(output.code)
    );
    assert.assert(codes.every((code) => !code.includes("__APP_MODE__")));

    const outputs = [...result.outputs.values()];
    const writtenFiles = await Promise.all(
      outputs.map((output) =>
        crossRuntime.runtime.fs.readFile(
          crossRuntime.runtime.path.join(outputDir, output.path),
        )
      ),
    );
    assert.assertEquals(writtenFiles, outputs.map((output) => output.code));
    assert.assertEquals(
      result.totalSize,
      outputs.reduce((sum, output) => sum + output.size, 0),
    );
  });
});

Deno.test("DenoBundlerBackend.bundle attaches each source map to its output", async () => {
  await withTempDir(async (tempDir) => {
    const { files, outputDir, result } = await bundleFixture(tempDir, true);

    assert.assertEquals(result.success, true);

    const decoder = new TextDecoder();
    const jsOutputs = [...result.outputs.values()].filter((output) =>
      output.path.endsWith(".js")
    );
    for (const output of jsOutputs) {
      const mapOutput = result.outputs.get(`${output.path}.map`);
      assert.assertExists(output.map, `${output.path} has no map`);
      assert.assertEquals(mapOutput?.code, output.map);

      const mapUrl = crossRuntime.runtime.path.basename(`${output.path}.map`);
      assert.assertStringIncludes(
        decoder.decode(output.code),
        `//# sourceMappingURL=${mapUrl}`,
      );
    }

    // Every source resolves, from where its map is written, to a fixture
    // file. The build ID entry is left out: its source was a temporary file.
    const sourceFiles = await Promise.all(
      jsOutputs
        .filter((output) => output.path !== "build-id.js")
        .flatMap((output) => {
          const map = JSON.parse(decoder.decode(output.map)) as {
            sources: string[];
          };
          const mapDir = crossRuntime.runtime.path.dirname(
            crossRuntime.runtime.path.join(outputDir, output.path),
          );
          return map.sources.map((source) =>
            crossRuntime.runtime.fs.realPath(
              crossRuntime.runtime.path.resolve(mapDir, source),
            )
          );
        }),
    );
    const fixtureFiles = await Promise.all(
      Object.values(files).map((file) =>
        crossRuntime.runtime.fs.realPath(file)
      ),
    );
    assert.assertEquals(
      [...new Set(sourceFiles)].sort(),
      fixtureFiles.sort(),
    );
  });
});

Deno.test("DenoBundlerBackend.bundle relocates inline source maps", async () => {
  await withTempDir(async (tempDir) => {
    const { files, outputDir, result } = await bundleFixture(
      tempDir,
      "inline",
    );

    assert.assertEquals(result.success, true);
    assert.assert(
      ![...result.outputs.keys()].some((name) => name.endsWith(".map")),
    );

    // Every inline source resolves, from where its file is written, to a
    // fixture file. The build ID entry is left out, as above.
    const decoder = new TextDecoder();
    const sourceFiles = await Promise.all(
      [...result.outputs.values()]
        .filter((output) => output.path !== "build-id.js")
        .flatMap((output) => {
          const code = decoder.decode(output.code);
          const encoded = code.split(
            "//# sourceMappingURL=data:application/json;base64,",
          )[1]?.trim();
          assert.assertExists(encoded, `${output.path} has no inline map`);
          const map = JSON.parse(
            decoder.decode(base64.decodeBase64(encoded)),
          ) as { sources: string[] };
          const fileDir = crossRuntime.runtime.path.dirname(
            crossRuntime.runtime.path.join(outputDir, output.path),
          );
          return map.sources.map((source) =>
            crossRuntime.runtime.fs.realPath(
              crossRuntime.runtime.path.resolve(fileDir, source),
            )
          );
        }),
    );
    const fixtureFiles = await Promise.all(
      Object.values(files).map((file) =>
        crossRuntime.runtime.fs.realPath(file)
      ),
    );
    assert.assertEquals(
      [...new Set(sourceFiles)].sort(),
      fixtureFiles.sort(),
    );
  });
});
