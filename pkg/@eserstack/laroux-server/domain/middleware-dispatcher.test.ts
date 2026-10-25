// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as middlewareDispatcher from "./middleware-dispatcher.ts";

/** Run a test with an empty temporary dist/ directory. */
const withDistDir = async (
  run: (distDir: string) => Promise<void>,
): Promise<void> => {
  const distDir = await runtime.fs.makeTempDir({ prefix: "laroux-proxy-" });
  try {
    await run(distDir);
  } finally {
    await runtime.fs.remove(distDir, { recursive: true });
  }
};

/**
 * Write the registry the bundler would generate and a proxy for /admin that
 * answers with text.
 */
const writeAdminProxy = async (distDir: string, text: string) => {
  const serverDir = runtime.path.join(distDir, "server");
  await runtime.fs.ensureDir(runtime.path.join(serverDir, "proxies"));
  await runtime.fs.writeTextFile(
    runtime.path.join(serverDir, "proxy-registry.ts"),
    `export const proxyRegistry = [
  { pathPrefix: "/admin", modulePath: "./proxies/admin.ts" },
];
`,
  );
  await runtime.fs.writeTextFile(
    runtime.path.join(serverDir, "proxies", "admin.ts"),
    `export default () => ({
  type: "response",
  response: new Response(${JSON.stringify(text)}),
});
`,
  );
};

/** The text a proxy answered for path, or null when every proxy passed. */
const runFor = async (
  dispatcher: middlewareDispatcher.MiddlewareDispatcher,
  path: string,
): Promise<string | null> => {
  const { result } = await dispatcher.runProxies(
    new Request(`http://localhost${path}`),
    path,
  );
  return result.type === "response" ? await result.response.text() : null;
};

nodeTest.test(
  "MiddlewareDispatcher runs a changed proxy after loading the next build",
  async () => {
    await withDistDir(async (distDir) => {
      const dispatcher = new middlewareDispatcher.MiddlewareDispatcher();
      await writeAdminProxy(distDir, "admin proxy of build 1");
      await dispatcher.loadProxies(distDir, "build-1");
      const first = await runFor(dispatcher, "/admin/users");

      // A rebuild rewrites the proxy module in place
      await writeAdminProxy(distDir, "admin proxy of build 2");
      const beforeReload = await runFor(dispatcher, "/admin/users");
      await dispatcher.loadProxies(distDir, "build-2");
      const afterReload = await runFor(dispatcher, "/admin/users");

      assert.assertEquals(first, "admin proxy of build 1");
      // The loaded build keeps the module it imported
      assert.assertEquals(beforeReload, "admin proxy of build 1");
      assert.assertEquals(afterReload, "admin proxy of build 2");
    });
  },
);

nodeTest.test(
  "MiddlewareDispatcher lets every request through when the build has no proxy registry",
  async () => {
    await withDistDir(async (distDir) => {
      const dispatcher = new middlewareDispatcher.MiddlewareDispatcher();
      await writeAdminProxy(distDir, "admin proxy");
      await dispatcher.loadProxies(distDir, "build-1");

      // A build without proxy.ts files writes no registry
      await runtime.fs.remove(
        runtime.path.join(distDir, "server", "proxy-registry.ts"),
      );
      await dispatcher.loadProxies(distDir, "build-2");

      assert.assertEquals(await runFor(dispatcher, "/admin/users"), null);
    });
  },
);

nodeTest.test(
  "MiddlewareDispatcher runs no proxy outside its path prefix",
  async () => {
    await withDistDir(async (distDir) => {
      const dispatcher = new middlewareDispatcher.MiddlewareDispatcher();
      await writeAdminProxy(distDir, "admin proxy");
      await dispatcher.loadProxies(distDir, "build-1");

      assert.assertEquals(await runFor(dispatcher, "/administrators"), null);
      assert.assertEquals(await runFor(dispatcher, "/admin"), "admin proxy");
    });
  },
);
