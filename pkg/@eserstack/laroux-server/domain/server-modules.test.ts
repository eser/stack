// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as larouxConfig from "@eserstack/laroux/config";
import * as system from "@eserstack/laroux-bundler/system";
import * as reactBundler from "@eserstack/laroux-bundler/adapters/react";
import type { BuildConfig } from "@eserstack/laroux-bundler/types";
import * as rebuildHandler from "./rebuild-handler.ts";
import * as serverModules from "./server-modules.ts";

/** Write files under root, creating their directories. */
const writeFiles = async (
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> => {
  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      const filePath = runtime.path.join(root, file);
      await runtime.fs.ensureDir(runtime.path.dirname(filePath));
      await runtime.fs.writeTextFile(filePath, content);
    }),
  );
};

/** Run a test with a temporary directory, removed afterwards. */
const withTempDir = async (
  prefix: string,
  run: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix });
  try {
    await run(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

// ============================================================================
// Loading a build
// ============================================================================

/**
 * The server output of one build as the bundler writes it: the generated
 * routes file imports the home page with the build id, and the page answers
 * with homeText.
 */
const writeServerOutput = (
  distDir: string,
  buildId: string,
  homeText: string,
): Promise<void> =>
  writeFiles(distDir, {
    "server/_generated-routes.ts": `import { HomePage } from "./src/app/routes/home/page.js?v=${buildId}";

export const generatedRoutes = [{ path: "/", component: HomePage }];
`,
    "server/src/app/routes/home/page.js": `export function HomePage() {
  return ${JSON.stringify(homeText)};
}
`,
    "server/src/app/layout.js": `export function Layout(props) {
  return props.children;
}
`,
    "server/src/app/not-found.js": `export function NotFound() {
  return "not found";
}
`,
  });

const renderHome = async (
  modules: serverModules.ServerModules,
): Promise<unknown> => {
  const app = await modules.getApp("/");
  return app.Page();
};

Deno.test("ServerModules serves a changed page after loading the next build", async () => {
  await withTempDir("laroux-modules-", async (distDir) => {
    const modules = new serverModules.ServerModules(distDir);
    await writeServerOutput(distDir, "build-1", "home of build 1");
    await modules.load("build-1");
    const first = await renderHome(modules);

    // A rebuild rewrites the server output in place
    await writeServerOutput(distDir, "build-2", "home of build 2");
    const beforeReload = await renderHome(modules);
    await modules.load("build-2");
    const afterReload = await renderHome(modules);

    assert.assertEquals(first, "home of build 1");
    assert.assertEquals(beforeReload, "home of build 1");
    assert.assertEquals(afterReload, "home of build 2");
    assert.assertEquals(modules.loadedBuildId(), "build-2");
  });
});

Deno.test("ServerModules gives a pathname no route matches the not-found page", async () => {
  await withTempDir("laroux-modules-", async (distDir) => {
    const modules = new serverModules.ServerModules(distDir);
    await writeServerOutput(distDir, "build-1", "home");
    await modules.load("build-1");

    const app = await modules.getApp("/missing");

    assert.assertEquals(app.Page(), "not found");
    assert.assertEquals(app.params, {});
  });
});

Deno.test("ServerModules stays on the loaded build when the next build's pages fail to import", async () => {
  await withTempDir("laroux-modules-", async (distDir) => {
    const modules = new serverModules.ServerModules(distDir);
    await writeServerOutput(distDir, "build-1", "home of build 1");
    await modules.load("build-1");

    await writeServerOutput(distDir, "build-2", "home of build 2");
    await runtime.fs.writeTextFile(
      runtime.path.join(distDir, "server/src/app/routes/home/page.js"),
      "export function HomePage( {\n",
    );
    // Deno reports a module that does not parse as a TypeError
    await assert.assertRejects(() => modules.load("build-2"), TypeError);

    assert.assertEquals(modules.loadedBuildId(), "build-1");
    assert.assertEquals(await renderHome(modules), "home of build 1");
  });
});

Deno.test("ServerModules names the missing load() when a page is requested first", async () => {
  const modules = new serverModules.ServerModules("/srv/app/dist");

  const error = await assert.assertRejects(() => modules.getApp("/"), Error);

  assert.assertStringIncludes(error.message, "call load(buildId) first");
});

// ============================================================================
// A dev rebuild of a real app
// ============================================================================

/**
 * The app's sources, with every text the server answers ending in version.
 * The page and the layout use no JSX: the test reads what the page returns
 * and needs no renderer.
 */
const appSources = (version: string): Record<string, string> => ({
  "src/app/layout.tsx": `export function Layout(props: { children: unknown }) {\n  return props.children;\n}\n`,
  "src/app/routes/home/page.tsx": `export function HomePage() {\n  return "home ${version}";\n}\n`,
  "src/app/routes/api/hello/route.ts": `export function GET(): Response {\n  return new Response("hello ${version}");\n}\n`,
  "src/app/routes/admin/proxy.ts": `export default function adminProxy() {
  return { type: "response", response: new Response("admin ${version}") };
}
`,
});

/**
 * The packages the client bundle imports by bare specifier, linked into the
 * test app from this package's node_modules.
 */
const APP_DEPENDENCIES = ["react", "react-dom", "@eserstack/laroux"];

/** Write a laroux app at projectRoot whose server answers with version. */
const writeApp = async (projectRoot: string): Promise<void> => {
  await writeFiles(projectRoot, {
    "package.json": JSON.stringify({
      name: "laroux-reload-test-app",
      type: "module",
    }),
    ...appSources("v1"),
  });

  const packageNodeModules = runtime.path.resolve(
    import.meta.dirname ?? ".",
    "../node_modules",
  );
  await runtime.fs.ensureDir(
    runtime.path.join(projectRoot, "node_modules", "@eserstack"),
  );
  await Promise.all(
    APP_DEPENDENCIES.map((name) =>
      // runtime has no symlink API, and this test runs on Deno only
      Deno.symlink(
        runtime.path.join(packageNodeModules, name),
        runtime.path.join(projectRoot, "node_modules", name),
      ),
    ),
  );
};

const createBuildConfig = (projectRoot: string): BuildConfig => ({
  projectRoot,
  srcDir: runtime.path.join(projectRoot, "src"),
  distDir: runtime.path.join(projectRoot, "dist"),
  logLevel: "error",
  fonts: [],
  images: larouxConfig.DEFAULT_IMAGES,
  cssModuleTypes: false,
  noCssModuleAutoReference: false,
  browserShims: larouxConfig.DEFAULT_BROWSER_SHIMS,
  serverExternals: larouxConfig.DEFAULT_SERVER_EXTERNALS,
});

/** What the page, the API route and the proxy answer. */
const readAnswers = async (modules: serverModules.ServerModules) => {
  const api = await modules.apiRoutes.handleRequest(
    new Request("http://localhost/api/hello"),
    "/api/hello",
  );
  const { result } = await modules.proxies.runProxies(
    new Request("http://localhost/admin"),
    "/admin",
  );

  return {
    page: await renderHome(modules),
    api: api === null ? null : await api.text(),
    proxy: result.type === "response" ? await result.response.text() : null,
  };
};

Deno.test("after a dev rebuild the server answers with the changed page, route.ts and proxy.ts", async () => {
  await withTempDir("laroux-reload-", async (projectRoot) => {
    await writeApp(projectRoot);
    const config = createBuildConfig(projectRoot);
    // laroux dev bundles the server with rolldown
    const context = system.createBuildContext(config, {
      framework: reactBundler.reactPlugin,
      bundlerBackend: "rolldown",
    });

    const first = await system.build(context);
    assert.assertEquals(first.success, true);
    const modules = new serverModules.ServerModules(config.distDir);
    await modules.load(first.buildId);
    const before = await readAnswers(modules);

    // The changes a developer saves, rebuilt the way the watcher rebuilds a
    // change without CSS, and handed to the rebuild handler as laroux dev
    // does
    const sources = appSources("v2");
    await writeFiles(projectRoot, sources);
    const rebuilt = await system.build(context, {
      skipCss: true,
      changedFiles: new Set(
        Object.keys(sources).map((file) =>
          runtime.path.join(projectRoot, file),
        ),
      ),
    });
    const updates: unknown[] = [];
    await rebuildHandler.createRebuildHandler({
      hmr: {
        notifyUpdate: (timestamp) => updates.push(timestamp),
        notifyError: (message) => updates.push(message),
      },
      onRebuilt: (buildId) => modules.load(buildId),
      logger: {
        info: () => undefined,
        error: () => undefined,
        with() {
          return this;
        },
      },
    })(rebuilt);
    const after = await readAnswers(modules);

    assert.assertEquals(before, {
      page: "home v1",
      api: "hello v1",
      proxy: "admin v1",
    });
    assert.assertEquals(rebuilt.success, true);
    assert.assertNotEquals(rebuilt.buildId, first.buildId);
    assert.assertEquals(updates, [rebuilt.timestamp]);
    assert.assertEquals(after, {
      page: "home v2",
      api: "hello v2",
      proxy: "admin v2",
    });
  });
});
