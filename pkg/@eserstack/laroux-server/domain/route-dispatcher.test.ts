// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as routeDispatcher from "./route-dispatcher.ts";

// The registry and the route module the bundler would write to dist/server/.
// The route answers with the params it received.
const API_ROUTES_SOURCE = `export const apiRoutes = [
  { path: "/api/items/[id]", modulePath: "./routes/echo.ts" },
  { path: "/api/docs/[...path]", modulePath: "./routes/echo.ts" },
];
`;

const ECHO_ROUTE_SOURCE = `export const GET = (context: { params: unknown }): Response =>
  Response.json(context.params);
`;

/** Run a test with an ApiRouteHandler loaded from a temporary dist/. */
const withApiRoutes = async (
  run: (handler: routeDispatcher.ApiRouteHandler) => Promise<void>,
): Promise<void> => {
  const distDir = await runtime.fs.makeTempDir({ prefix: "laroux-api-" });
  try {
    const serverDir = runtime.path.join(distDir, "server");
    await runtime.fs.ensureDir(runtime.path.join(serverDir, "routes"));
    await runtime.fs.writeTextFile(
      runtime.path.join(serverDir, "api-routes.ts"),
      API_ROUTES_SOURCE,
    );
    await runtime.fs.writeTextFile(
      runtime.path.join(serverDir, "routes", "echo.ts"),
      ECHO_ROUTE_SOURCE,
    );

    const handler = new routeDispatcher.ApiRouteHandler();
    await handler.loadRoutes(distDir, "build-1");
    await run(handler);
  } finally {
    await runtime.fs.remove(distDir, { recursive: true });
  }
};

const paramCases: ReadonlyArray<{
  readonly name: string;
  readonly pathname: string;
  readonly expected: unknown;
}> = [
  {
    name: "decodes a dynamic segment",
    pathname: "/api/items/hello%20world",
    expected: { id: "hello world" },
  },
  {
    name: "matches a catch-all's bare prefix",
    pathname: "/api/docs",
    expected: { path: [] },
  },
  {
    name: "matches a catch-all's bare prefix with a trailing slash",
    pathname: "/api/docs/",
    expected: { path: [] },
  },
  {
    name: "decodes each catch-all segment and keeps an encoded slash inside it",
    pathname: "/api/docs/a%2Fb/caf%C3%A9",
    expected: { path: ["a/b", "café"] },
  },
];

for (const { name, pathname, expected } of paramCases) {
  nodeTest.test(`ApiRouteHandler ${name}`, async () => {
    await withApiRoutes(async (handler) => {
      const response = await handler.handleRequest(
        new Request(`http://localhost${pathname}`),
        pathname,
      );

      assert.assertNotEquals(response, null);
      assert.assertEquals(response?.status, 200);
      assert.assertEquals(await response?.json(), expected);
    });
  });
}

nodeTest.test(
  "ApiRouteHandler returns null for a path no route matches",
  async () => {
    await withApiRoutes(async (handler) => {
      const response = await handler.handleRequest(
        new Request("http://localhost/api/other"),
        "/api/other",
      );

      assert.assertEquals(response, null);
    });
  },
);

/** Run a test with an empty temporary dist/ directory. */
const withDistDir = async (
  run: (distDir: string) => Promise<void>,
): Promise<void> => {
  const distDir = await runtime.fs.makeTempDir({ prefix: "laroux-api-" });
  try {
    await run(distDir);
  } finally {
    await runtime.fs.remove(distDir, { recursive: true });
  }
};

/** Write the registry and a hello route that answers with text. */
const writeHelloRoute = async (distDir: string, text: string) => {
  const serverDir = runtime.path.join(distDir, "server");
  await runtime.fs.ensureDir(runtime.path.join(serverDir, "routes"));
  await runtime.fs.writeTextFile(
    runtime.path.join(serverDir, "api-routes.ts"),
    `export const apiRoutes = [
  { path: "/api/hello", modulePath: "./routes/hello.ts" },
];
`,
  );
  await runtime.fs.writeTextFile(
    runtime.path.join(serverDir, "routes", "hello.ts"),
    `export const GET = (): Response => new Response(${JSON.stringify(
      text,
    )});\n`,
  );
};

const getHello = async (
  handler: routeDispatcher.ApiRouteHandler,
): Promise<string | null> => {
  const response = await handler.handleRequest(
    new Request("http://localhost/api/hello"),
    "/api/hello",
  );
  return response === null ? null : await response.text();
};

nodeTest.test(
  "ApiRouteHandler serves a changed route module after loading the next build",
  async () => {
    await withDistDir(async (distDir) => {
      const handler = new routeDispatcher.ApiRouteHandler();
      await writeHelloRoute(distDir, "hello from build 1");
      await handler.loadRoutes(distDir, "build-1");
      const first = await getHello(handler);

      // A rebuild rewrites the route module in place
      await writeHelloRoute(distDir, "hello from build 2");
      const beforeReload = await getHello(handler);
      await handler.loadRoutes(distDir, "build-2");
      const afterReload = await getHello(handler);

      assert.assertEquals(first, "hello from build 1");
      // The loaded build keeps the module it imported
      assert.assertEquals(beforeReload, "hello from build 1");
      assert.assertEquals(afterReload, "hello from build 2");
    });
  },
);

nodeTest.test(
  "ApiRouteHandler drops the routes of a build whose registry is gone",
  async () => {
    await withDistDir(async (distDir) => {
      const handler = new routeDispatcher.ApiRouteHandler();
      await writeHelloRoute(distDir, "hello");
      await handler.loadRoutes(distDir, "build-1");

      // A build without route.ts files writes no registry
      await runtime.fs.remove(
        runtime.path.join(distDir, "server", "api-routes.ts"),
      );
      await handler.loadRoutes(distDir, "build-2");

      assert.assertEquals(await getHello(handler), null);
    });
  },
);

nodeTest.test(
  "ApiRouteHandler answers 500 without the error's details when a handler throws",
  async () => {
    await withDistDir(async (distDir) => {
      const handler = new routeDispatcher.ApiRouteHandler();
      await writeHelloRoute(distDir, "hello");
      await runtime.fs.writeTextFile(
        runtime.path.join(distDir, "server", "routes", "hello.ts"),
        "export const GET = () => { throw new Error('secret detail'); };\n",
      );
      await handler.loadRoutes(distDir, "build-1");

      const response = await handler.handleRequest(
        new Request("http://localhost/api/hello"),
        "/api/hello",
      );

      assert.assertEquals(response?.status, 500);
      const body = await response?.text();
      assert.assertEquals(body?.includes("secret detail"), false);
    });
  },
);
