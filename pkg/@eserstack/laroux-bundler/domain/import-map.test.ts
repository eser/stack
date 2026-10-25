// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as importMap from "./import-map.ts";

Deno.test("import-map", async (t) => {
  // Create a temp directory for test fixtures
  const tempDir = await runtime.fs.makeTempDir({ prefix: "import-map-test-" });

  await t.step("loadImportMap - deno.json only", async () => {
    // Create test deno.json
    const denoJson = {
      imports: {
        react: "npm:react@^19.0.0",
        "lucide-react": "npm:lucide-react@^0.500.0",
        "@eserstack/logging": "jsr:@eserstack/logging@^4.0.0",
        "@/": "./src/",
      },
    };
    await runtime.fs.writeTextFile(
      runtime.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const map = await importMap.loadImportMap(tempDir);

    assert.assertExists(map);
    assert.assertEquals(map.hasDenoJson, true);
    assert.assertEquals(map.hasPackageJson, false);
    assert.assertEquals(map.entries.size, 4);

    // Check entries
    const reactEntry = map.entries.get("react");
    assert.assertExists(reactEntry);
    assert.assertEquals(reactEntry.target, "npm:react@^19.0.0");
    assert.assertEquals(reactEntry.source, "deno.json");
    assert.assertEquals(reactEntry.isNpmPackage, true);
    assert.assertEquals(reactEntry.isJsrPackage, false);

    const loggingEntry = map.entries.get("@eserstack/logging");
    assert.assertExists(loggingEntry);
    assert.assertEquals(loggingEntry.target, "jsr:@eserstack/logging@^4.0.0");
    assert.assertEquals(loggingEntry.isJsrPackage, true);
    assert.assertEquals(loggingEntry.isNpmPackage, false);

    const pathAliasEntry = map.entries.get("@/");
    assert.assertExists(pathAliasEntry);
    assert.assertEquals(pathAliasEntry.target, "./src/");
    assert.assertEquals(pathAliasEntry.isLocalPath, true);

    // Check externals include npm/jsr packages
    assert.assertEquals(map.externals.includes("react"), true);
    assert.assertEquals(map.externals.includes("lucide-react"), true);
    assert.assertEquals(map.externals.includes("@eserstack/logging"), true);
    // Local path should not be in externals
    assert.assertEquals(map.externals.includes("@/"), false);

    // Cleanup
    await runtime.fs.remove(runtime.path.join(tempDir, "deno.json"));
  });

  await t.step("loadImportMap - package.json only", async () => {
    // Create test package.json
    const packageJson = {
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
      },
    };
    await runtime.fs.writeTextFile(
      runtime.path.join(tempDir, "package.json"),
      JSON.stringify(packageJson, null, 2),
    );

    const map = await importMap.loadImportMap(tempDir);

    assert.assertExists(map);
    assert.assertEquals(map.hasDenoJson, false);
    assert.assertEquals(map.hasPackageJson, true);
    assert.assertEquals(map.entries.size, 3);

    // Check entries are converted to npm: specifiers
    const reactEntry = map.entries.get("react");
    assert.assertExists(reactEntry);
    assert.assertEquals(reactEntry.target, "npm:react@^19.0.0");
    assert.assertEquals(reactEntry.source, "package.json");
    assert.assertEquals(reactEntry.isNpmPackage, true);

    // Check externals
    assert.assertEquals(map.externals.includes("react"), true);
    assert.assertEquals(map.externals.includes("react-dom"), true);
    assert.assertEquals(map.externals.includes("typescript"), true);

    // Cleanup
    await runtime.fs.remove(runtime.path.join(tempDir, "package.json"));
  });

  await t.step(
    "loadImportMap - combined deno.json + package.json",
    async () => {
      // deno.json takes priority over package.json
      const denoJson = {
        imports: {
          react: "npm:react@^19.2.0", // Different version
          "@eserstack/logging": "jsr:@eserstack/logging@^4.0.0",
        },
      };
      const packageJson = {
        dependencies: {
          react: "^18.0.0", // Older version - should be overwritten
          "lucide-react": "^0.500.0",
        },
      };

      await runtime.fs.writeTextFile(
        runtime.path.join(tempDir, "deno.json"),
        JSON.stringify(denoJson, null, 2),
      );
      await runtime.fs.writeTextFile(
        runtime.path.join(tempDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      const map = await importMap.loadImportMap(tempDir);

      assert.assertExists(map);
      assert.assertEquals(map.hasDenoJson, true);
      assert.assertEquals(map.hasPackageJson, true);

      // deno.json version should take priority
      const reactEntry = map.entries.get("react");
      assert.assertExists(reactEntry);
      assert.assertEquals(reactEntry.target, "npm:react@^19.2.0");
      assert.assertEquals(reactEntry.source, "deno.json"); // From deno.json, not package.json

      // package.json only entries should still be present
      const lucideEntry = map.entries.get("lucide-react");
      assert.assertExists(lucideEntry);
      assert.assertEquals(lucideEntry.target, "npm:lucide-react@^0.500.0");
      assert.assertEquals(lucideEntry.source, "package.json");

      // Cleanup
      await runtime.fs.remove(runtime.path.join(tempDir, "deno.json"));
      await runtime.fs.remove(runtime.path.join(tempDir, "package.json"));
    },
  );

  await t.step("resolveSpecifier - exact match", async () => {
    const denoJson = {
      imports: {
        react: "npm:react@^19.0.0",
        "lucide-react": "npm:lucide-react@^0.500.0",
      },
    };
    await runtime.fs.writeTextFile(
      runtime.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const map = await importMap.loadImportMap(tempDir);

    // Exact match
    assert.assertEquals(
      importMap.resolveSpecifier("react", map),
      "npm:react@^19.0.0",
    );
    assert.assertEquals(
      importMap.resolveSpecifier("lucide-react", map),
      "npm:lucide-react@^0.500.0",
    );

    // Non-existent
    assert.assertEquals(importMap.resolveSpecifier("nonexistent", map), null);

    // Cleanup
    await runtime.fs.remove(runtime.path.join(tempDir, "deno.json"));
  });

  await t.step("resolveSpecifier - subpath imports", async () => {
    const denoJson = {
      imports: {
        "react-dom": "npm:react-dom@^19.0.0",
        "@/": "./src/",
      },
    };
    await runtime.fs.writeTextFile(
      runtime.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const map = await importMap.loadImportMap(tempDir);

    // Subpath of package
    assert.assertEquals(
      importMap.resolveSpecifier("react-dom/client", map),
      "npm:react-dom@^19.0.0/client",
    );

    // Path alias subpath
    assert.assertEquals(
      importMap.resolveSpecifier("@/components/Button", map),
      "./src/components/Button",
    );

    // Cleanup
    await runtime.fs.remove(runtime.path.join(tempDir, "deno.json"));
  });

  await t.step("isExternal - checks external packages", async () => {
    const denoJson = {
      imports: {
        react: "npm:react@^19.0.0",
        "@eserstack/logging": "jsr:@eserstack/logging@^4.0.0",
        "@/": "./src/",
      },
    };
    await runtime.fs.writeTextFile(
      runtime.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const map = await importMap.loadImportMap(tempDir);

    // npm packages are external
    assert.assertEquals(importMap.isExternal("react", map), true);
    assert.assertEquals(importMap.isExternal("react/jsx-runtime", map), true);

    // jsr packages are external
    assert.assertEquals(importMap.isExternal("@eserstack/logging", map), true);

    // Local paths are not external
    assert.assertEquals(importMap.isExternal("@/", map), false);
    assert.assertEquals(
      importMap.isExternal("@/components/Button", map),
      false,
    );

    // Protocol-prefixed are always external
    assert.assertEquals(importMap.isExternal("npm:react", map), true);
    assert.assertEquals(
      importMap.isExternal("jsr:@eserstack/logging", map),
      true,
    );
    assert.assertEquals(importMap.isExternal("node:fs", map), true);

    // Cleanup
    await runtime.fs.remove(runtime.path.join(tempDir, "deno.json"));
  });

  await t.step("getExternals - returns external package list", async () => {
    const denoJson = {
      imports: {
        react: "npm:react@^19.0.0",
        "lucide-react": "npm:lucide-react@^0.500.0",
        "@eserstack/logging": "jsr:@eserstack/logging@^4.0.0",
        "@/": "./src/",
      },
    };
    await runtime.fs.writeTextFile(
      runtime.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const map = await importMap.loadImportMap(tempDir);
    const externals = importMap.getExternals(map);

    // Should include npm/jsr packages
    assert.assertEquals(externals.includes("react"), true);
    assert.assertEquals(externals.includes("lucide-react"), true);
    assert.assertEquals(externals.includes("@eserstack/logging"), true);

    // Should NOT include local paths
    assert.assertEquals(externals.includes("@/"), false);

    // Cleanup
    await runtime.fs.remove(runtime.path.join(tempDir, "deno.json"));
  });

  await t.step("loadImportMap - empty directory", async () => {
    const emptyDir = await runtime.fs.makeTempDir({
      prefix: "import-map-empty-",
    });

    const map = await importMap.loadImportMap(emptyDir);

    assert.assertExists(map);
    assert.assertEquals(map.hasDenoJson, false);
    assert.assertEquals(map.hasPackageJson, false);
    assert.assertEquals(map.entries.size, 0);
    assert.assertEquals(map.externals.length, 0);

    // Cleanup
    await runtime.fs.remove(emptyDir, { recursive: true });
  });

  // Cleanup temp directory
  await runtime.fs.remove(tempDir, { recursive: true });
});

Deno.test("getProtocol", async (t) => {
  await t.step("extracts protocol from standard URLs", () => {
    assert.assertEquals(importMap.getProtocol("https://example.com"), "https:");
    assert.assertEquals(
      importMap.getProtocol("http://localhost:3000"),
      "http:",
    );
    assert.assertEquals(importMap.getProtocol("file:///path/to/file"), "file:");
  });

  await t.step("extracts protocol from custom specifiers", () => {
    assert.assertEquals(importMap.getProtocol("npm:react@^19.0.0"), "npm:");
    assert.assertEquals(
      importMap.getProtocol("jsr:@eserstack/logging@^4.0.0"),
      "jsr:",
    );
    assert.assertEquals(importMap.getProtocol("node:fs"), "node:");
  });

  await t.step("returns null for bare specifiers", () => {
    assert.assertEquals(importMap.getProtocol("react"), null);
    assert.assertEquals(importMap.getProtocol("@eserstack/logging"), null);
    assert.assertEquals(importMap.getProtocol("lodash/merge"), null);
  });

  await t.step("returns null for relative paths", () => {
    assert.assertEquals(importMap.getProtocol("./utils.ts"), null);
    assert.assertEquals(importMap.getProtocol("../lib/index.ts"), null);
  });

  await t.step("returns null for absolute paths", () => {
    assert.assertEquals(importMap.getProtocol("/src/utils.ts"), null);
  });
});

Deno.test("isPathSpecifier", async (t) => {
  await t.step("identifies relative paths", () => {
    assert.assertEquals(importMap.isPathSpecifier("./utils.ts"), true);
    assert.assertEquals(importMap.isPathSpecifier("../lib/index.ts"), true);
    assert.assertEquals(importMap.isPathSpecifier("./"), true);
  });

  await t.step("identifies absolute paths", () => {
    assert.assertEquals(importMap.isPathSpecifier("/src/utils.ts"), true);
    assert.assertEquals(importMap.isPathSpecifier("/"), true);
  });

  await t.step("rejects bare specifiers", () => {
    assert.assertEquals(importMap.isPathSpecifier("react"), false);
    assert.assertEquals(importMap.isPathSpecifier("@eserstack/logging"), false);
    assert.assertEquals(importMap.isPathSpecifier("lodash/merge"), false);
  });

  await t.step("rejects protocol-prefixed specifiers", () => {
    assert.assertEquals(importMap.isPathSpecifier("npm:react"), false);
    assert.assertEquals(
      importMap.isPathSpecifier("jsr:@eserstack/logging"),
      false,
    );
    assert.assertEquals(
      importMap.isPathSpecifier("https://example.com"),
      false,
    );
  });
});

Deno.test("isBareSpecifier", async (t) => {
  await t.step("identifies bare package imports", () => {
    assert.assertEquals(importMap.isBareSpecifier("react"), true);
    assert.assertEquals(importMap.isBareSpecifier("@eserstack/logging"), true);
    assert.assertEquals(importMap.isBareSpecifier("lodash/merge"), true);
    assert.assertEquals(importMap.isBareSpecifier("lucide-react"), true);
  });

  await t.step("rejects relative paths", () => {
    assert.assertEquals(importMap.isBareSpecifier("./utils.ts"), false);
    assert.assertEquals(importMap.isBareSpecifier("../lib/index.ts"), false);
  });

  await t.step("rejects absolute paths", () => {
    assert.assertEquals(importMap.isBareSpecifier("/src/utils.ts"), false);
  });

  await t.step("rejects protocol-prefixed specifiers", () => {
    assert.assertEquals(importMap.isBareSpecifier("npm:react"), false);
    assert.assertEquals(
      importMap.isBareSpecifier("jsr:@eserstack/logging"),
      false,
    );
    assert.assertEquals(importMap.isBareSpecifier("node:fs"), false);
    assert.assertEquals(
      importMap.isBareSpecifier("https://example.com"),
      false,
    );
    assert.assertEquals(
      importMap.isBareSpecifier("file:///path/to/file"),
      false,
    );
  });
});
