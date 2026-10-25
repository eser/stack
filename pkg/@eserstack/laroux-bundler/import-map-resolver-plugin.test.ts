// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as fsPromises from "node:fs/promises"; // symlinks are not available in runtime
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as bundler from "./domain/bundler.ts";
import * as importMapResolverPlugin from "./import-map-resolver-plugin.ts";
import type { ResolvedBrowserShimsConfig } from "./types.ts";

const NO_SHIMS: ResolvedBrowserShimsConfig = { jsr: {}, nodeBuiltins: {} };

nodeTest.test("track-l-delete: import-map-resolver-plugin", async (t) => {
  await t.test(
    "createImportMapResolverPlugin - creates plugin with name",
    () => {
      const plugin = importMapResolverPlugin.createImportMapResolverPlugin({
        projectRoot: "/tmp",
        browserShims: NO_SHIMS,
      });

      assert.assertExists(plugin);
      assert.assertEquals(plugin.name, "import-map-resolver");
      assert.assertEquals(typeof plugin.setup, "function");
    },
  );

  await t.test("createImportMapResolverPlugin - accepts browser shims", () => {
    const plugin = importMapResolverPlugin.createImportMapResolverPlugin({
      projectRoot: "/tmp",
      browserShims: {
        jsr: {
          "@eserstack/logging":
            "export const logger = { getLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) };",
        },
        nodeBuiltins: {
          "node:fs": "export default {};",
          "node:path": "export default {};",
        },
      },
    });

    assert.assertExists(plugin);
    assert.assertEquals(plugin.name, "import-map-resolver");
  });

  await t.test("createImportMapResolverPlugin - accepts custom cache", () => {
    const cache = new Map<string, string>();
    cache.set("react", "external");

    const plugin = importMapResolverPlugin.createImportMapResolverPlugin({
      projectRoot: "/tmp",
      browserShims: NO_SHIMS,
      cache,
    });

    assert.assertExists(plugin);
    assert.assertEquals(plugin.name, "import-map-resolver");
  });
});

/** Link linkPath to target, creating the parent directories of linkPath. */
async function linkDir(target: string, linkPath: string): Promise<void> {
  await fsPromises.mkdir(runtime.path.dirname(linkPath), { recursive: true });
  await fsPromises.symlink(target, linkPath, "dir");
}

/** Write each file of files under root, creating the directories. */
async function writeFiles(
  root: string,
  files: Record<string, string>,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      const filePath = runtime.path.join(root, file);
      await runtime.fs.ensureDir(runtime.path.dirname(filePath));
      await runtime.fs.writeTextFile(filePath, content);
    }),
  );
}

/**
 * Write an app with pnpm's isolated node_modules layout and run fn on it.
 *
 * The app declares app-only-dep, which declares app-only-transitive. Only
 * app-only-dep is linked at the top of node_modules; app-only-transitive sits
 * next to it in the .pnpm store, where only app-only-dep sees it. Neither
 * package is installed for laroux-bundler.
 */
async function withIsolatedLayoutApp(
  fn: (projectRoot: string, entry: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await runtime.fs.makeTempDir({
    prefix: "laroux-isolated-",
  });
  const store = runtime.path.join(projectRoot, "node_modules", ".pnpm");
  const depDir = runtime.path.join(
    store,
    "app-only-dep@1.0.0/node_modules/app-only-dep",
  );
  const transitiveDir = runtime.path.join(
    store,
    "app-only-transitive@1.0.0/node_modules/app-only-transitive",
  );

  try {
    await writeFiles(projectRoot, {
      "package.json": JSON.stringify({
        name: "laroux-isolated-app",
        type: "module",
        dependencies: { "app-only-dep": "^1.0.0" },
      }),
      "src/main.ts":
        'import { greet } from "app-only-dep";\n\nexport const message = greet();\n',
    });
    await writeFiles(depDir, {
      "package.json": JSON.stringify({
        name: "app-only-dep",
        version: "1.0.0",
        type: "module",
        exports: {
          ".": { browser: "./browser.js", default: "./server.js" },
        },
        dependencies: { "app-only-transitive": "^1.0.0" },
      }),
      "browser.js":
        'import { suffix } from "app-only-transitive";\n\nexport const greet = () => "app-only-dep in the browser" + suffix;\n',
      "server.js": 'export const greet = () => "app-only-dep on the server";\n',
    });
    await writeFiles(transitiveDir, {
      "package.json": JSON.stringify({
        name: "app-only-transitive",
        version: "1.0.0",
        type: "module",
        exports: "./index.js",
      }),
      "index.js": 'export const suffix = " with app-only-transitive";\n',
    });
    await linkDir(
      transitiveDir,
      runtime.path.join(
        store,
        "app-only-dep@1.0.0/node_modules/app-only-transitive",
      ),
    );
    await linkDir(
      depDir,
      runtime.path.join(projectRoot, "node_modules", "app-only-dep"),
    );

    await fn(projectRoot, runtime.path.join(projectRoot, "src/main.ts"));
  } finally {
    await runtime.fs.remove(projectRoot, { recursive: true });
  }
}

/** Bundle entry with the resolver plugin and return the output code. */
async function bundleWithResolver(
  projectRoot: string,
  entry: string,
  options: {
    platform: "browser" | "node";
    autoMarkExternal: boolean;
    browserShims?: ResolvedBrowserShimsConfig;
  },
): Promise<string> {
  const outputDir = runtime.path.join(projectRoot, "dist");
  const result = await bundler.bundle(
    {
      entrypoints: [entry],
      outputDir,
      projectRoot,
      platform: options.platform,
      splitting: false,
      plugins: [
        importMapResolverPlugin.createImportMapResolverPlugin({
          projectRoot,
          browserShims: options.browserShims ?? NO_SHIMS,
          autoMarkExternal: options.autoMarkExternal,
        }),
      ],
    },
    [],
    "rolldown",
  );

  const code = await Promise.all(
    Object.keys(result.outputs).map((file) =>
      runtime.fs.readTextFile(runtime.path.join(outputDir, file)),
    ),
  );
  return code.join("\n");
}

nodeTest.test(
  "track-l-delete: a browser bundle resolves a dependency only the app declares, under pnpm's isolated layout",
  async () => {
    await withIsolatedLayoutApp(async (projectRoot, entry) => {
      const code = await bundleWithResolver(projectRoot, entry, {
        platform: "browser",
        autoMarkExternal: false,
      });

      // The browser export of the app's dependency and that dependency's own
      // dependency are inlined, and no bare specifier is left for a browser
      assert.assertStringIncludes(code, "app-only-dep in the browser");
      assert.assertStringIncludes(code, " with app-only-transitive");
      assert.assertEquals(code.includes("app-only-dep on the server"), false);
      assert.assertEquals(/from\s*["']app-only-/.test(code), false);
    });
  },
);

nodeTest.test(
  "track-l-delete: with autoMarkExternal, a declared dependency stays a bare import",
  async () => {
    await withIsolatedLayoutApp(async (projectRoot, entry) => {
      const code = await bundleWithResolver(projectRoot, entry, {
        platform: "node",
        autoMarkExternal: true,
      });

      // ADR 0004: the specifier is kept as written, never rewritten
      assert.assertMatch(code, /from\s*["']app-only-dep["']/);
      assert.assertEquals(code.includes("app-only-dep on the server"), false);
    });
  },
);

nodeTest.test(
  "track-l-delete: a browser shim replaces a package the app declares",
  async () => {
    await withIsolatedLayoutApp(async (projectRoot, entry) => {
      const code = await bundleWithResolver(projectRoot, entry, {
        platform: "browser",
        autoMarkExternal: false,
        browserShims: {
          jsr: {
            "app-only-dep": 'export const greet = () => "app-only-dep shim";\n',
          },
          nodeBuiltins: {},
        },
      });

      assert.assertStringIncludes(code, "app-only-dep shim");
      assert.assertEquals(code.includes("app-only-dep in the browser"), false);
    });
  },
);
