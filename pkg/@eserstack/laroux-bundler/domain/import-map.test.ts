// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as importMap from "./import-map.ts";

/** Write package.json to a fresh temp directory, run fn and remove it. */
async function withPackageJson(
  packageJson: unknown,
  fn: (projectRoot: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await runtime.fs.makeTempDir({
    prefix: "import-map-test-",
  });

  try {
    if (packageJson !== null) {
      await runtime.fs.writeTextFile(
        runtime.path.join(projectRoot, "package.json"),
        JSON.stringify(packageJson, null, 2),
      );
    }
    await fn(projectRoot);
  } finally {
    await runtime.fs.remove(projectRoot, { recursive: true });
  }
}

nodeTest.test("track-l-delete: import-map", async (t) => {
  await t.test("loadImportMap reads every dependency field", async () => {
    await withPackageJson(
      {
        dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
        devDependencies: { typescript: "^5.0.0" },
        peerDependencies: { "lucide-react": "^0.500.0" },
      },
      async (projectRoot) => {
        const map = await importMap.loadImportMap(projectRoot);

        assert.assertEquals(map.hasPackageJson, true);
        assert.assertEquals(map.projectRoot, projectRoot);
        assert.assertEquals([...map.entries.keys()].sort(), [
          "lucide-react",
          "react",
          "react-dom",
          "typescript",
        ]);
        assert.assertEquals(map.entries.get("react"), {
          specifier: "react",
          target: "react",
          version: "^19.0.0",
        });
        assert.assertEquals([...map.externals].sort(), [
          "lucide-react",
          "react",
          "react-dom",
          "typescript",
        ]);
      },
    );
  });

  await t.test(
    "loadImportMap lets dependencies win over dev and peer dependencies",
    async () => {
      await withPackageJson(
        {
          dependencies: { react: "^19.2.0" },
          devDependencies: { react: "^18.0.0" },
          peerDependencies: { react: "^17.0.0" },
        },
        async (projectRoot) => {
          const map = await importMap.loadImportMap(projectRoot);

          assert.assertEquals(map.entries.get("react")?.version, "^19.2.0");
          assert.assertEquals(map.externals, ["react"]);
        },
      );
    },
  );

  await t.test(
    "loadImportMap skips workspace, file and link references",
    async () => {
      await withPackageJson(
        {
          dependencies: {
            react: "^19.0.0",
            "@eserstack/laroux": "workspace:*",
            "local-lib": "file:../local-lib",
            "linked-lib": "link:../linked-lib",
          },
        },
        async (projectRoot) => {
          const map = await importMap.loadImportMap(projectRoot);

          assert.assertEquals([...map.entries.keys()], ["react"]);
          assert.assertEquals(map.externals, ["react"]);
        },
      );
    },
  );

  await t.test("loadImportMap reads only package.json", async () => {
    await withPackageJson(null, async (projectRoot) => {
      // A deno.json import map is not read
      await runtime.fs.writeTextFile(
        runtime.path.join(projectRoot, "deno.json"),
        JSON.stringify({ imports: { react: "npm:react@^19.0.0" } }),
      );

      const map = await importMap.loadImportMap(projectRoot);

      assert.assertEquals(map.hasPackageJson, false);
      assert.assertEquals(map.entries.size, 0);
      assert.assertEquals(map.externals.length, 0);
    });
  });

  await t.test(
    "resolveSpecifier keeps declared bare specifiers as they are",
    async () => {
      await withPackageJson(
        { dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" } },
        async (projectRoot) => {
          const map = await importMap.loadImportMap(projectRoot);

          assert.assertEquals(
            importMap.resolveSpecifier("react", map),
            "react",
          );
          assert.assertEquals(
            importMap.resolveSpecifier("react-dom/client", map),
            "react-dom/client",
          );
          assert.assertEquals(
            importMap.resolveSpecifier("nonexistent", map),
            null,
          );
          // A package whose name only starts like a declared one
          assert.assertEquals(
            importMap.resolveSpecifier("react-router", map),
            null,
          );
        },
      );
    },
  );

  await t.test(
    "isExternal accepts declared packages and node built-ins",
    async () => {
      await withPackageJson(
        { dependencies: { react: "^19.0.0" } },
        async (projectRoot) => {
          const map = await importMap.loadImportMap(projectRoot);

          assert.assertEquals(importMap.isExternal("react", map), true);
          assert.assertEquals(
            importMap.isExternal("react/jsx-runtime", map),
            true,
          );
          assert.assertEquals(importMap.isExternal("node:fs", map), true);
          assert.assertEquals(importMap.isExternal("lodash", map), false);
          assert.assertEquals(importMap.isExternal("./utils.ts", map), false);
        },
      );
    },
  );

  await t.test("getExternals returns the declared packages", async () => {
    await withPackageJson(
      { dependencies: { react: "^19.0.0", "lucide-react": "^0.500.0" } },
      async (projectRoot) => {
        const map = await importMap.loadImportMap(projectRoot);

        assert.assertEquals(importMap.getExternals(map).sort(), [
          "lucide-react",
          "react",
        ]);
      },
    );
  });
});

nodeTest.test("track-l-delete: getProtocol", async (t) => {
  await t.test("extracts protocol from standard URLs", () => {
    assert.assertEquals(importMap.getProtocol("https://example.com"), "https:");
    assert.assertEquals(
      importMap.getProtocol("http://localhost:3000"),
      "http:",
    );
    assert.assertEquals(importMap.getProtocol("file:///path/to/file"), "file:");
  });

  await t.test("extracts protocol from other prefixes", () => {
    assert.assertEquals(importMap.getProtocol("node:fs"), "node:");
    assert.assertEquals(importMap.getProtocol("workspace:*"), "workspace:");
  });

  await t.test("returns null for bare specifiers", () => {
    assert.assertEquals(importMap.getProtocol("react"), null);
    assert.assertEquals(importMap.getProtocol("@eserstack/logging"), null);
    assert.assertEquals(importMap.getProtocol("lodash/merge"), null);
  });

  await t.test("returns null for relative paths", () => {
    assert.assertEquals(importMap.getProtocol("./utils.ts"), null);
    assert.assertEquals(importMap.getProtocol("../lib/index.ts"), null);
  });

  await t.test("returns null for absolute paths", () => {
    assert.assertEquals(importMap.getProtocol("/src/utils.ts"), null);
  });
});

nodeTest.test("track-l-delete: isPathSpecifier", async (t) => {
  await t.test("identifies relative paths", () => {
    assert.assertEquals(importMap.isPathSpecifier("./utils.ts"), true);
    assert.assertEquals(importMap.isPathSpecifier("../lib/index.ts"), true);
    assert.assertEquals(importMap.isPathSpecifier("./"), true);
  });

  await t.test("identifies absolute paths", () => {
    assert.assertEquals(importMap.isPathSpecifier("/src/utils.ts"), true);
    assert.assertEquals(importMap.isPathSpecifier("/"), true);
  });

  await t.test("rejects bare specifiers", () => {
    assert.assertEquals(importMap.isPathSpecifier("react"), false);
    assert.assertEquals(importMap.isPathSpecifier("@eserstack/logging"), false);
    assert.assertEquals(importMap.isPathSpecifier("lodash/merge"), false);
  });

  await t.test("rejects protocol-prefixed specifiers", () => {
    assert.assertEquals(importMap.isPathSpecifier("node:fs"), false);
    assert.assertEquals(
      importMap.isPathSpecifier("https://example.com"),
      false,
    );
  });
});

nodeTest.test("track-l-delete: isBareSpecifier", async (t) => {
  await t.test("identifies bare package imports", () => {
    assert.assertEquals(importMap.isBareSpecifier("react"), true);
    assert.assertEquals(importMap.isBareSpecifier("@eserstack/logging"), true);
    assert.assertEquals(importMap.isBareSpecifier("lodash/merge"), true);
    assert.assertEquals(importMap.isBareSpecifier("lucide-react"), true);
  });

  await t.test("rejects relative paths", () => {
    assert.assertEquals(importMap.isBareSpecifier("./utils.ts"), false);
    assert.assertEquals(importMap.isBareSpecifier("../lib/index.ts"), false);
  });

  await t.test("rejects absolute paths", () => {
    assert.assertEquals(importMap.isBareSpecifier("/src/utils.ts"), false);
  });

  await t.test("rejects protocol-prefixed specifiers", () => {
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
