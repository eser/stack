// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as fsPromises from "node:fs/promises"; // symlinks are not available in runtime
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as larouxConfig from "@eserstack/laroux/config";
import * as bundler from "../../domain/bundler.ts";
import * as importMapResolverPlugin from "../../import-map-resolver-plugin.ts";
import * as rscClientEntry from "./rsc-client-entry.ts";
import type { ClientComponent } from "./rsc-analyze.ts";

/** Link linkPath to target, creating the parent directories of linkPath. */
async function linkDir(target: string, linkPath: string): Promise<void> {
  await fsPromises.mkdir(runtime.path.dirname(linkPath), { recursive: true });
  await fsPromises.symlink(target, linkPath, "dir");
}

// The component goes to createClientEntry directly, so it needs no
// "use client" directive, which rolldown would warn about when bundling.
const COUNTER_SOURCE = `import * as React from "react";

export function Counter() {
  const [count, setCount] = React.useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
`;

/**
 * The packages the copied bootstrap imports by bare specifier, which an
 * installed laroux app has in its node_modules.
 */
const APP_DEPENDENCIES = ["react", "react-dom", "@eserstack/laroux"];

/**
 * The directory laroux-react's own dependencies are installed in. The test
 * app links APP_DEPENDENCIES from there.
 */
function larouxReactNodeModules(): string {
  const bootstrapIndex = rscClientEntry.fileUrlToPath(
    import.meta.resolve("@eserstack/laroux-react/client/bootstrap"),
  );
  // <package root>/client/bootstrap/index.ts
  const packageRoot = runtime.path.resolve(bootstrapIndex, "../../..");
  return runtime.path.join(packageRoot, "node_modules");
}

/**
 * Write a minimal laroux app with one client component to a temp directory
 * and run fn on it, removing the directory afterwards.
 */
async function withMinimalApp(
  fn: (
    appRoot: string,
    components: readonly ClientComponent[],
  ) => Promise<void>,
): Promise<void> {
  const appRoot = await runtime.fs.makeTempDir({ prefix: "laroux-app-" });

  try {
    const componentPath = runtime.path.join(appRoot, "src/app/counter.tsx");
    await runtime.fs.ensureDir(runtime.path.dirname(componentPath));
    await runtime.fs.writeTextFile(componentPath, COUNTER_SOURCE);
    await runtime.fs.writeTextFile(
      runtime.path.join(appRoot, "package.json"),
      JSON.stringify({
        name: "laroux-test-app",
        type: "module",
        dependencies: {
          "@eserstack/laroux": "^4.5.2",
          react: "^19.3.0",
          "react-dom": "^19.3.0",
        },
      }),
    );

    const sourceModules = larouxReactNodeModules();
    await Promise.all(
      APP_DEPENDENCIES.map((name) =>
        linkDir(
          runtime.path.join(sourceModules, name),
          runtime.path.join(appRoot, "node_modules", name),
        ),
      ),
    );

    await fn(appRoot, [
      {
        filePath: componentPath,
        relativePath: "src/app/counter.tsx",
        exportNames: ["Counter"],
      },
    ]);
  } finally {
    await runtime.fs.remove(appRoot, { recursive: true });
  }
}

const FILE_URL_CASES = [
  {
    name: "decodes percent-escapes",
    input: "file:///home/me/My%20App/node_modules/x.ts",
    expected: "/home/me/My App/node_modules/x.ts",
  },
  {
    name: "drops the slash before a Windows drive letter",
    input: "file:///C:/apps/site/x.ts",
    expected: "C:/apps/site/x.ts",
  },
  {
    name: "returns a path that is not a file URL unchanged",
    input: "/home/me/app/x.ts",
    expected: "/home/me/app/x.ts",
  },
];

for (const { name, input, expected } of FILE_URL_CASES) {
  nodeTest.test(`fileUrlToPath ${name}`, () => {
    assert.assertEquals(rscClientEntry.fileUrlToPath(input), expected);
  });
}

nodeTest.test(
  "createClientEntry copies the bootstrap with its package layout",
  async () => {
    await withMinimalApp(async (appRoot, components) => {
      const distDir = runtime.path.join(appRoot, "dist");

      await rscClientEntry.createClientEntry([...components], appRoot, distDir);

      const copyDir = runtime.path.join(
        distDir,
        rscClientEntry.BOOTSTRAP_COPY_DIR,
      );
      const copied = await Promise.all(
        [
          "client/bootstrap/entry.ts",
          "client.ts",
          "protocol.ts",
          "runtime/image/fallback.ts",
          "runtime/navigation/link-navigation.ts",
        ].map((file) => runtime.fs.exists(runtime.path.join(copyDir, file))),
      );
      assert.assertEquals(copied, [true, true, true, true, true]);
    });
  },
);

nodeTest.test(
  "the client entry of a minimal laroux app bundles with the copied bootstrap",
  async () => {
    await withMinimalApp(async (appRoot, components) => {
      const distDir = runtime.path.join(appRoot, "dist");
      const outputDir = runtime.path.join(distDir, "client");

      const entry = await rscClientEntry.createClientEntry(
        [...components],
        appRoot,
        distDir,
      );
      const result = await bundler.bundle(
        {
          entrypoints: [entry, ...components.map((c) => c.filePath)],
          outputDir,
          projectRoot: appRoot,
          platform: "browser",
          splitting: true,
          plugins: [
            importMapResolverPlugin.createImportMapResolverPlugin({
              projectRoot: appRoot,
              browserShims: larouxConfig.DEFAULT_BROWSER_SHIMS,
              autoMarkExternal: false,
            }),
          ],
        },
        [...components],
        "rolldown",
      );

      assert.assertEquals(result.entrypoint, "client.js");
      // The component maps to its chunk even though the temp directory may sit
      // under a symlink (/var on macOS) that the bundler resolves.
      assert.assertEquals(
        Object.keys(result.manifest),
        components.map((c) => c.filePath),
      );
      const outputCode = await Promise.all(
        Object.keys(result.outputs).map((file) =>
          runtime.fs.readTextFile(runtime.path.join(outputDir, file)),
        ),
      );
      const bundled = outputCode.join("\n");
      // Code from entry.ts and from the files it imports by relative path
      // (../../client.ts, ../../runtime/image/fallback.ts,
      // ../../runtime/navigation/link-navigation.ts) is in the bundle.
      assert.assertStringIncludes(bundled, "__callServer");
      assert.assertStringIncludes(bundled, "__RSC_INLINE_BOOTSTRAP__");
      assert.assertStringIncludes(bundled, "data-laroux-fallback");
      assert.assertStringIncludes(bundled, "data-laroux-link");
      // An import the bundler cannot resolve stays in the output as a bare
      // specifier, which a browser cannot load.
      assert.assertEquals(
        bundled.match(/from\s*["']@eserstack\/[^"']*["']/g),
        null,
      );
    });
  },
);
