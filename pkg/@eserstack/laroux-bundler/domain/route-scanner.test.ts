// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as fsPromises from "node:fs/promises"; // utimes is not available in runtime
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as buildCache from "./build-cache.ts";
import * as routeScanner from "./route-scanner.ts";

// Every file of the fixture routes tree, relative to the routes directory.
const FIXTURE_FILES = [
  "home/page.tsx",
  "about/page.tsx",
  "stories/[slug]/page.tsx",
  "docs_v2/page.tsx",
  "api/health/route.ts",
  "admin/proxy.ts",
  "_private/page.tsx",
  "_private/layout.tsx",
  "_private/route.ts",
  "_private/proxy.ts",
  "_private/nested/page.tsx",
  "admin/_internal/page.tsx",
  "admin/_internal/route.ts",
  "about/_draft/page.tsx",
];

/**
 * Writes the fixture tree under a parent directory whose own name starts with
 * "_", so a test also shows that only segments below the routes directory
 * decide what is private.
 */
async function createRoutesFixture(): Promise<{
  root: string;
  projectRoot: string;
  routesDir: string;
}> {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-routes-" });
  const projectRoot = runtime.path.join(root, "_workspace", "app");
  const routesDir = runtime.path.join(projectRoot, "src", "app", "routes");

  await Promise.all(
    FIXTURE_FILES.map(async (relativePath) => {
      const filePath = runtime.path.join(routesDir, relativePath);
      await runtime.fs.mkdir(runtime.path.dirname(filePath), {
        recursive: true,
      });
      await runtime.fs.writeTextFile(filePath, "export {};\n");
    }),
  );

  return { root, projectRoot, routesDir };
}

async function scanFixture(): Promise<routeScanner.ScanResult> {
  const fixture = await createRoutesFixture();

  try {
    return await routeScanner.scanRoutes(
      fixture.routesDir,
      fixture.projectRoot,
    );
  } finally {
    await runtime.fs.remove(fixture.root, { recursive: true });
  }
}

nodeTest.test("route-scanner", async (t) => {
  const result = await scanFixture();
  const pageRoutes = result.routes.map((route) => route.routePath).sort();
  const apiRoutes = result.apiRoutes.map((route) => route.routePath).sort();
  const proxyPrefixes = result.proxies.map((proxy) => proxy.pathPrefix);

  await t.test("scanRoutes routes pages outside private directories", () => {
    assert.assertEquals(pageRoutes, [
      "/",
      "/about",
      "/docs_v2",
      "/stories/[slug]",
    ]);
  });

  await t.test("scanRoutes skips a page in an _-prefixed directory", () => {
    assert.assertEquals(
      result.routes.filter((route) => route.componentPath.includes("/_")),
      [],
    );
  });

  await t.test(
    "scanRoutes skips route handlers and proxies in an _-prefixed directory",
    () => {
      assert.assertEquals(apiRoutes, ["/api/health"]);
      assert.assertEquals(proxyPrefixes, ["/admin"]);
    },
  );

  await t.test(
    "scanRoutes does not apply a private directory's layout to other pages",
    () => {
      assert.assertEquals(
        result.routes.filter((route) => route.layoutPath !== undefined),
        [],
      );
    },
  );
});

/** Write page files under a new project and return its routes directory. */
async function createProject(
  root: string,
  name: string,
  pages: readonly string[],
): Promise<{ projectRoot: string; routesDir: string }> {
  const projectRoot = runtime.path.join(root, name);
  const routesDir = runtime.path.join(projectRoot, "src", "app", "routes");

  await Promise.all(
    pages.map(async (relativePath) => {
      const filePath = runtime.path.join(routesDir, relativePath);
      await runtime.fs.mkdir(runtime.path.dirname(filePath), {
        recursive: true,
      });
      await runtime.fs.writeTextFile(filePath, "export {};\n");
    }),
  );

  return { projectRoot, routesDir };
}

const routePaths = (result: routeScanner.ScanResult): string[] =>
  result.routes.map((route) => route.routePath).sort();

nodeTest.test("route-scanner with two projects", async (t) => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-routes-" });

  try {
    const blog = await createProject(root, "blog", [
      "home/page.tsx",
      "posts/page.tsx",
    ]);
    const shop = await createProject(root, "shop", [
      "home/page.tsx",
      "cart/page.tsx",
    ]);
    // An older routes directory than the first project's: a cache shared
    // by every project and checked by mtime alone would hand this project
    // the first one's routes.
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await fsPromises.utimes(shop.routesDir, anHourAgo, anHourAgo);

    await t.test(
      "scanRoutes without a cache returns each directory's own routes",
      async () => {
        const blogRoutes = await routeScanner.scanRoutes(
          blog.routesDir,
          blog.projectRoot,
        );
        const shopRoutes = await routeScanner.scanRoutes(
          shop.routesDir,
          shop.projectRoot,
        );

        assert.assertEquals(routePaths(blogRoutes), ["/", "/posts"]);
        assert.assertEquals(routePaths(shopRoutes), ["/", "/cart"]);
      },
    );

    await t.test(
      "scanRoutes with one shared cache keeps each directory's scan apart",
      async () => {
        const cache = new buildCache.BuildCache();
        const options = { cache };

        await routeScanner.scanRoutes(
          blog.routesDir,
          blog.projectRoot,
          options,
        );
        const shopRoutes = await routeScanner.scanRoutes(
          shop.routesDir,
          shop.projectRoot,
          options,
        );
        const blogAgain = await routeScanner.scanRoutes(
          blog.routesDir,
          blog.projectRoot,
          options,
        );

        assert.assertEquals(routePaths(shopRoutes), ["/", "/cart"]);
        assert.assertEquals(routePaths(blogAgain), ["/", "/posts"]);
      },
    );

    await t.test(
      "scanRoutes sees a nested page after the cache drops its directory",
      async () => {
        const cache = new buildCache.BuildCache();
        const options = { cache };
        await routeScanner.scanRoutes(
          blog.routesDir,
          blog.projectRoot,
          options,
        );
        await routeScanner.scanRoutes(
          shop.routesDir,
          shop.projectRoot,
          options,
        );

        // A page two levels down leaves the routes directory's mtime as
        // it was, so the watch mode invalidation is what drops the scan.
        const nestedPage = runtime.path.join(
          blog.routesDir,
          "posts",
          "[slug]",
          "page.tsx",
        );
        await runtime.fs.mkdir(runtime.path.dirname(nestedPage), {
          recursive: true,
        });
        await runtime.fs.writeTextFile(nestedPage, "export {};\n");
        cache.invalidateFile(nestedPage);

        // The change drops only the scan of the directory that holds it
        const shopCached = cache.getRouteScan(shop.routesDir, 0);
        const blogRoutes = await routeScanner.scanRoutes(
          blog.routesDir,
          blog.projectRoot,
          options,
        );

        assert.assertNotEquals(shopCached, null);
        assert.assertEquals(routePaths(blogRoutes), [
          "/",
          "/posts",
          "/posts/[slug]",
        ]);
      },
    );
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});
