// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertExists } from "@std/assert";
import { current } from "@eser/standards/runtime";
import {
  getExternals,
  getProtocol,
  isBareSpecifier,
  isExternal,
  isPathSpecifier,
  loadImportMap,
  resolveSpecifier,
} from "./import-map.ts";

Deno.test("import-map", async (t) => {
  // Create a temp directory for test fixtures
  const tempDir = await current.fs.makeTempDir({ prefix: "import-map-test-" });

  await t.step("loadImportMap - deno.json only", async () => {
    // Create test deno.json
    const denoJson = {
      imports: {
        "react": "npm:react@^19.0.0",
        "lucide-react": "npm:lucide-react@^0.500.0",
        "@eser/logging": "jsr:@eser/logging@^4.0.0",
        "@/": "./src/",
      },
    };
    await current.fs.writeTextFile(
      current.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const importMap = await loadImportMap(tempDir);

    assertExists(importMap);
    assertEquals(importMap.hasDenoJson, true);
    assertEquals(importMap.hasPackageJson, false);
    assertEquals(importMap.entries.size, 4);

    // Check entries
    const reactEntry = importMap.entries.get("react");
    assertExists(reactEntry);
    assertEquals(reactEntry.target, "npm:react@^19.0.0");
    assertEquals(reactEntry.source, "deno.json");
    assertEquals(reactEntry.isNpmPackage, true);
    assertEquals(reactEntry.isJsrPackage, false);

    const loggingEntry = importMap.entries.get("@eser/logging");
    assertExists(loggingEntry);
    assertEquals(loggingEntry.target, "jsr:@eser/logging@^4.0.0");
    assertEquals(loggingEntry.isJsrPackage, true);
    assertEquals(loggingEntry.isNpmPackage, false);

    const pathAliasEntry = importMap.entries.get("@/");
    assertExists(pathAliasEntry);
    assertEquals(pathAliasEntry.target, "./src/");
    assertEquals(pathAliasEntry.isLocalPath, true);

    // Check externals include npm/jsr packages
    assertEquals(importMap.externals.includes("react"), true);
    assertEquals(importMap.externals.includes("lucide-react"), true);
    assertEquals(importMap.externals.includes("@eser/logging"), true);
    // Local path should not be in externals
    assertEquals(importMap.externals.includes("@/"), false);

    // Cleanup
    await current.fs.remove(current.path.join(tempDir, "deno.json"));
  });

  await t.step("loadImportMap - package.json only", async () => {
    // Create test package.json
    const packageJson = {
      dependencies: {
        "react": "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "typescript": "^5.0.0",
      },
    };
    await current.fs.writeTextFile(
      current.path.join(tempDir, "package.json"),
      JSON.stringify(packageJson, null, 2),
    );

    const importMap = await loadImportMap(tempDir);

    assertExists(importMap);
    assertEquals(importMap.hasDenoJson, false);
    assertEquals(importMap.hasPackageJson, true);
    assertEquals(importMap.entries.size, 3);

    // Check entries are converted to npm: specifiers
    const reactEntry = importMap.entries.get("react");
    assertExists(reactEntry);
    assertEquals(reactEntry.target, "npm:react@^19.0.0");
    assertEquals(reactEntry.source, "package.json");
    assertEquals(reactEntry.isNpmPackage, true);

    // Check externals
    assertEquals(importMap.externals.includes("react"), true);
    assertEquals(importMap.externals.includes("react-dom"), true);
    assertEquals(importMap.externals.includes("typescript"), true);

    // Cleanup
    await current.fs.remove(current.path.join(tempDir, "package.json"));
  });

  await t.step(
    "loadImportMap - combined deno.json + package.json",
    async () => {
      // deno.json takes priority over package.json
      const denoJson = {
        imports: {
          "react": "npm:react@^19.2.0", // Different version
          "@eser/logging": "jsr:@eser/logging@^4.0.0",
        },
      };
      const packageJson = {
        dependencies: {
          "react": "^18.0.0", // Older version - should be overwritten
          "lucide-react": "^0.500.0",
        },
      };

      await current.fs.writeTextFile(
        current.path.join(tempDir, "deno.json"),
        JSON.stringify(denoJson, null, 2),
      );
      await current.fs.writeTextFile(
        current.path.join(tempDir, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );

      const importMap = await loadImportMap(tempDir);

      assertExists(importMap);
      assertEquals(importMap.hasDenoJson, true);
      assertEquals(importMap.hasPackageJson, true);

      // deno.json version should take priority
      const reactEntry = importMap.entries.get("react");
      assertExists(reactEntry);
      assertEquals(reactEntry.target, "npm:react@^19.2.0");
      assertEquals(reactEntry.source, "deno.json"); // From deno.json, not package.json

      // package.json only entries should still be present
      const lucideEntry = importMap.entries.get("lucide-react");
      assertExists(lucideEntry);
      assertEquals(lucideEntry.target, "npm:lucide-react@^0.500.0");
      assertEquals(lucideEntry.source, "package.json");

      // Cleanup
      await current.fs.remove(current.path.join(tempDir, "deno.json"));
      await current.fs.remove(current.path.join(tempDir, "package.json"));
    },
  );

  await t.step("resolveSpecifier - exact match", async () => {
    const denoJson = {
      imports: {
        "react": "npm:react@^19.0.0",
        "lucide-react": "npm:lucide-react@^0.500.0",
      },
    };
    await current.fs.writeTextFile(
      current.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const importMap = await loadImportMap(tempDir);

    // Exact match
    assertEquals(resolveSpecifier("react", importMap), "npm:react@^19.0.0");
    assertEquals(
      resolveSpecifier("lucide-react", importMap),
      "npm:lucide-react@^0.500.0",
    );

    // Non-existent
    assertEquals(resolveSpecifier("nonexistent", importMap), null);

    // Cleanup
    await current.fs.remove(current.path.join(tempDir, "deno.json"));
  });

  await t.step("resolveSpecifier - subpath imports", async () => {
    const denoJson = {
      imports: {
        "react-dom": "npm:react-dom@^19.0.0",
        "@/": "./src/",
      },
    };
    await current.fs.writeTextFile(
      current.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const importMap = await loadImportMap(tempDir);

    // Subpath of package
    assertEquals(
      resolveSpecifier("react-dom/client", importMap),
      "npm:react-dom@^19.0.0/client",
    );

    // Path alias subpath
    assertEquals(
      resolveSpecifier("@/components/Button", importMap),
      "./src/components/Button",
    );

    // Cleanup
    await current.fs.remove(current.path.join(tempDir, "deno.json"));
  });

  await t.step("isExternal - checks external packages", async () => {
    const denoJson = {
      imports: {
        "react": "npm:react@^19.0.0",
        "@eser/logging": "jsr:@eser/logging@^4.0.0",
        "@/": "./src/",
      },
    };
    await current.fs.writeTextFile(
      current.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const importMap = await loadImportMap(tempDir);

    // npm packages are external
    assertEquals(isExternal("react", importMap), true);
    assertEquals(isExternal("react/jsx-runtime", importMap), true);

    // jsr packages are external
    assertEquals(isExternal("@eser/logging", importMap), true);

    // Local paths are not external
    assertEquals(isExternal("@/", importMap), false);
    assertEquals(isExternal("@/components/Button", importMap), false);

    // Protocol-prefixed are always external
    assertEquals(isExternal("npm:react", importMap), true);
    assertEquals(isExternal("jsr:@eser/logging", importMap), true);
    assertEquals(isExternal("node:fs", importMap), true);

    // Cleanup
    await current.fs.remove(current.path.join(tempDir, "deno.json"));
  });

  await t.step("getExternals - returns external package list", async () => {
    const denoJson = {
      imports: {
        "react": "npm:react@^19.0.0",
        "lucide-react": "npm:lucide-react@^0.500.0",
        "@eser/logging": "jsr:@eser/logging@^4.0.0",
        "@/": "./src/",
      },
    };
    await current.fs.writeTextFile(
      current.path.join(tempDir, "deno.json"),
      JSON.stringify(denoJson, null, 2),
    );

    const importMap = await loadImportMap(tempDir);
    const externals = getExternals(importMap);

    // Should include npm/jsr packages
    assertEquals(externals.includes("react"), true);
    assertEquals(externals.includes("lucide-react"), true);
    assertEquals(externals.includes("@eser/logging"), true);

    // Should NOT include local paths
    assertEquals(externals.includes("@/"), false);

    // Cleanup
    await current.fs.remove(current.path.join(tempDir, "deno.json"));
  });

  await t.step("loadImportMap - empty directory", async () => {
    const emptyDir = await current.fs.makeTempDir({
      prefix: "import-map-empty-",
    });

    const importMap = await loadImportMap(emptyDir);

    assertExists(importMap);
    assertEquals(importMap.hasDenoJson, false);
    assertEquals(importMap.hasPackageJson, false);
    assertEquals(importMap.entries.size, 0);
    assertEquals(importMap.externals.length, 0);

    // Cleanup
    await current.fs.remove(emptyDir, { recursive: true });
  });

  // Cleanup temp directory
  await current.fs.remove(tempDir, { recursive: true });
});

Deno.test("getProtocol", async (t) => {
  await t.step("extracts protocol from standard URLs", () => {
    assertEquals(getProtocol("https://example.com"), "https:");
    assertEquals(getProtocol("http://localhost:3000"), "http:");
    assertEquals(getProtocol("file:///path/to/file"), "file:");
  });

  await t.step("extracts protocol from custom specifiers", () => {
    assertEquals(getProtocol("npm:react@^19.0.0"), "npm:");
    assertEquals(getProtocol("jsr:@eser/logging@^4.0.0"), "jsr:");
    assertEquals(getProtocol("node:fs"), "node:");
  });

  await t.step("returns null for bare specifiers", () => {
    assertEquals(getProtocol("react"), null);
    assertEquals(getProtocol("@eser/logging"), null);
    assertEquals(getProtocol("lodash/merge"), null);
  });

  await t.step("returns null for relative paths", () => {
    assertEquals(getProtocol("./utils.ts"), null);
    assertEquals(getProtocol("../lib/index.ts"), null);
  });

  await t.step("returns null for absolute paths", () => {
    assertEquals(getProtocol("/src/utils.ts"), null);
  });
});

Deno.test("isPathSpecifier", async (t) => {
  await t.step("identifies relative paths", () => {
    assertEquals(isPathSpecifier("./utils.ts"), true);
    assertEquals(isPathSpecifier("../lib/index.ts"), true);
    assertEquals(isPathSpecifier("./"), true);
  });

  await t.step("identifies absolute paths", () => {
    assertEquals(isPathSpecifier("/src/utils.ts"), true);
    assertEquals(isPathSpecifier("/"), true);
  });

  await t.step("rejects bare specifiers", () => {
    assertEquals(isPathSpecifier("react"), false);
    assertEquals(isPathSpecifier("@eser/logging"), false);
    assertEquals(isPathSpecifier("lodash/merge"), false);
  });

  await t.step("rejects protocol-prefixed specifiers", () => {
    assertEquals(isPathSpecifier("npm:react"), false);
    assertEquals(isPathSpecifier("jsr:@eser/logging"), false);
    assertEquals(isPathSpecifier("https://example.com"), false);
  });
});

Deno.test("isBareSpecifier", async (t) => {
  await t.step("identifies bare package imports", () => {
    assertEquals(isBareSpecifier("react"), true);
    assertEquals(isBareSpecifier("@eser/logging"), true);
    assertEquals(isBareSpecifier("lodash/merge"), true);
    assertEquals(isBareSpecifier("lucide-react"), true);
  });

  await t.step("rejects relative paths", () => {
    assertEquals(isBareSpecifier("./utils.ts"), false);
    assertEquals(isBareSpecifier("../lib/index.ts"), false);
  });

  await t.step("rejects absolute paths", () => {
    assertEquals(isBareSpecifier("/src/utils.ts"), false);
  });

  await t.step("rejects protocol-prefixed specifiers", () => {
    assertEquals(isBareSpecifier("npm:react"), false);
    assertEquals(isBareSpecifier("jsr:@eser/logging"), false);
    assertEquals(isBareSpecifier("node:fs"), false);
    assertEquals(isBareSpecifier("https://example.com"), false);
    assertEquals(isBareSpecifier("file:///path/to/file"), false);
  });
});
