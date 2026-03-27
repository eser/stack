// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertExists } from "@std/assert";
import { runtime } from "@eser/standards/cross-runtime";
import { createImportMapResolverPlugin } from "./import-map-resolver-plugin.ts";
import type { ImportMap } from "./domain/import-map.ts";

Deno.test("import-map-resolver-plugin", async (t) => {
  await t.step(
    "createImportMapResolverPlugin - creates plugin with name",
    () => {
      const plugin = createImportMapResolverPlugin({
        projectRoot: "/tmp",
        browserShims: {
          jsr: {},
          nodeBuiltins: {},
        },
      });

      assertExists(plugin);
      assertEquals(plugin.name, "import-map-resolver");
      assertEquals(typeof plugin.setup, "function");
    },
  );

  await t.step(
    "createImportMapResolverPlugin - accepts pre-loaded import map",
    () => {
      const importMap: ImportMap = {
        entries: new Map([
          ["react", {
            specifier: "react",
            target: "npm:react@^19.0.0",
            source: "deno.json",
            isNpmPackage: true,
            isJsrPackage: false,
            isLocalPath: false,
          }],
        ]),
        externals: ["react"],
        projectRoot: "/tmp",
        hasDenoJson: true,
        hasPackageJson: false,
      };

      const plugin = createImportMapResolverPlugin({
        projectRoot: "/tmp",
        browserShims: { jsr: {}, nodeBuiltins: {} },
        importMap,
      });

      assertExists(plugin);
      assertEquals(plugin.name, "import-map-resolver");
    },
  );

  await t.step("createImportMapResolverPlugin - accepts browser shims", () => {
    const plugin = createImportMapResolverPlugin({
      projectRoot: "/tmp",
      browserShims: {
        jsr: {
          "@eser/logging":
            "export const logger = { getLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) };",
        },
        nodeBuiltins: {
          "node:fs": "export default {};",
          "node:path": "export default {};",
        },
      },
    });

    assertExists(plugin);
    assertEquals(plugin.name, "import-map-resolver");
  });

  await t.step("createImportMapResolverPlugin - accepts custom cache", () => {
    const cache = new Map<string, string>();
    cache.set("react", "external");

    const plugin = createImportMapResolverPlugin({
      projectRoot: "/tmp",
      browserShims: { jsr: {}, nodeBuiltins: {} },
      cache,
    });

    assertExists(plugin);
    assertEquals(plugin.name, "import-map-resolver");
  });

  await t.step(
    "isBareSpecifier logic - handled by plugin resolution",
    async () => {
      // Create a temp directory with a deno.json
      const tempDir = await runtime.fs.makeTempDir({
        prefix: "resolver-test-",
      });

      const denoJson = {
        imports: {
          "react": "npm:react@^19.0.0",
          "@/": "./src/",
        },
      };
      await runtime.fs.writeTextFile(
        runtime.path.join(tempDir, "deno.json"),
        JSON.stringify(denoJson, null, 2),
      );

      const plugin = createImportMapResolverPlugin({
        projectRoot: tempDir,
        browserShims: { jsr: {}, nodeBuiltins: {} },
      });

      assertExists(plugin);

      // Cleanup
      await runtime.fs.remove(tempDir, { recursive: true });
    },
  );
});

Deno.test("import-map-resolver-plugin with fixtures", async (t) => {
  // Create a temp directory for test fixtures
  const tempDir = await runtime.fs.makeTempDir({ prefix: "resolver-fixture-" });
  const srcDir = runtime.path.join(tempDir, "src");
  await runtime.fs.ensureDir(srcDir);

  await t.step("setup test files", async () => {
    // Create deno.json
    const denoJson = {
      imports: {
        "react": "npm:react@^19.0.0",
        "react-dom": "npm:react-dom@^19.0.0",
        "@eser/logging": "jsr:@eser/logging@^4.0.0",
        "@/": "./src/",
      },
    };
    await runtime.fs.writeTextFile(
      runtime.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    // Create a source file
    await runtime.fs.writeTextFile(
      runtime.path.join(srcDir, "utils.ts"),
      "export const sum = (a: number, b: number) => a + b;",
    );
  });

  await t.step("plugin setup loads import map automatically", () => {
    const plugin = createImportMapResolverPlugin({
      projectRoot: tempDir,
      browserShims: { jsr: {}, nodeBuiltins: {} },
    });

    // The plugin's setup function would load the import map
    // We can't easily test the full resolution flow without a mock build context,
    // but we can verify the plugin is created correctly
    assertExists(plugin.setup);
    assertEquals(typeof plugin.setup, "function");
  });

  await t.step("plugin with browser shims for JSR packages", () => {
    const plugin = createImportMapResolverPlugin({
      projectRoot: tempDir,
      browserShims: {
        jsr: {
          "@eser/logging":
            `export const logger = { getLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) };`,
        },
        nodeBuiltins: {},
      },
    });

    assertExists(plugin);
    // The plugin should use the browser shim when resolving @eser/logging
    // Actual resolution testing would require mocking the build context
  });

  await t.step("plugin with node builtin shims", () => {
    const plugin = createImportMapResolverPlugin({
      projectRoot: tempDir,
      browserShims: {
        jsr: {},
        nodeBuiltins: {
          "node:fs": "export default {};",
          "node:path": "export const join = (...parts) => parts.join('/');",
        },
      },
    });

    assertExists(plugin);
  });

  // Cleanup
  await runtime.fs.remove(tempDir, { recursive: true });
});
