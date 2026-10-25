// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as React from "react";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as config from "@eserstack/laroux/config";
import type * as larouxRouter from "@eserstack/laroux/router";
import * as larouxClient from "@eserstack/laroux-react/client";
import * as hmrManager from "../domain/hmr-manager.ts";
import * as middlewareDispatcher from "../domain/middleware-dispatcher.ts";
import * as server from "./server.ts";
import type { ServerDependencies } from "./server.ts";

/** A bundler that serves an empty build, as no client components need. */
const emptyBundler: ServerDependencies["bundler"] = {
  getBundle: () =>
    Promise.resolve({
      clientCode: null,
      moduleMap: {},
      chunkManifest: {
        version: "1",
        buildId: "server-test",
        timestamp: 0,
        entrypoint: "client.js",
        logLevel: "info",
        chunks: {},
        files: {},
      },
      entrypoint: "/client.js",
    }),
};

const makeDeps = (
  root: string,
  getApp: ServerDependencies["getApp"] = () =>
    Promise.reject(new Error("no pages in this test")),
): ServerDependencies => ({
  config: {
    ...config.DEFAULT_CONFIG,
    projectRoot: root,
    distDir: runtime.path.join(root, "dist"),
  } as unknown as ServerDependencies["config"],
  bundler: emptyBundler,
  getApp,
  getBuildId: () => "server-test",
  rateLimitConfig: false,
});

// ============================================================================
// Server actions
// ============================================================================

/**
 * The source of an export of dist/server/actions.js that the build marked as
 * a server action, as the server action transform does.
 */
const serverAction = (name: string, body: string): string =>
  `export const ${name} = ${body};
Object.defineProperties(${name}, {
  $$typeof: { value: Symbol.for("react.server.reference") },
  $$id: { value: "actions#${name}" },
});
`;

/**
 * Write dist/server/actions.js with `source` and an actions manifest that
 * lists it, unless `listed` is false.
 */
const writeActions = async (
  root: string,
  source: string,
  listed = true,
): Promise<void> => {
  const serverDir = runtime.path.join(root, "dist", "server");
  await runtime.fs.ensureDir(serverDir);
  await runtime.fs.writeTextFile(
    runtime.path.join(serverDir, "actions.js"),
    source,
  );
  await runtime.fs.writeTextFile(
    runtime.path.join(serverDir, "actions-manifest.json"),
    JSON.stringify({ actions: listed ? ["actions.js"] : [] }),
  );
};

/** Run a test with server actions written to dist/server/actions.js. */
const withActions = async (
  source: string,
  run: (handler: ReturnType<typeof server.createHandler>) => Promise<void>,
  listed = true,
): Promise<void> => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-actions-" });
  try {
    await writeActions(root, source, listed);
    await run(server.createHandler(makeDeps(root)));
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
};

const postAction = (
  handler: ReturnType<typeof server.createHandler>,
  actionId: string,
  body: BodyInit,
  headers: Record<string, string> = {},
): Promise<Response> =>
  handler(
    new Request("http://localhost/_rsc", {
      method: "POST",
      headers: {
        "RSC-Action": actionId,
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    }),
  );

Deno.test("POST /_rsc sends an action's Date and Map result as RSC", async () => {
  await withActions(
    serverAction(
      "stats",
      `(label) => ({
        label,
        savedAt: new Date("2026-01-02T03:04:05.000Z"),
        counts: new Map([["views", 3]]),
      })`,
    ),
    async (handler) => {
      const response = await postAction(handler, "actions#stats", '["$5"]');

      assert.assertEquals(response.status, 200);
      assert.assertStringIncludes(
        response.headers.get("Content-Type") ?? "",
        "text/x-component",
      );
      assert.assertExists(response.body);
      assert.assertEquals(
        await larouxClient.createValueFromReadableStream(response.body),
        {
          label: "$5",
          savedAt: new Date("2026-01-02T03:04:05.000Z"),
          counts: new Map([["views", 3]]),
        },
      );
    },
  );
});

Deno.test("POST /_rsc answers 400 when the arguments are not a JSON array", async () => {
  await withActions(
    serverAction("echo", "(value) => value"),
    async (handler) => {
      for (const body of ['{"value":1}', "not json"]) {
        // Sequential: each case reads its own response before the next.
        // oxlint-disable-next-line no-await-in-loop
        const response = await postAction(handler, "actions#echo", body);
        assert.assertEquals(response.status, 400, body);
        // Reads the same case's body before the next case starts.
        // oxlint-disable-next-line no-await-in-loop
        assert.assertStringIncludes(await response.text(), "JSON array");
      }
    },
  );
});

Deno.test("POST /_rsc refuses an export that is not a server action, and does not run it", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-actions-" });
  try {
    const markerPath = runtime.path.join(root, "ran");
    await writeActions(
      root,
      serverAction("echo", "(value) => value") +
        `export const helper = () => Deno.writeTextFileSync(${JSON.stringify(
          markerPath,
        )}, "ran");\n`,
    );
    const handler = server.createHandler(makeDeps(root));

    const response = await postAction(handler, "actions#helper", "[]");

    assert.assertEquals(response.status, 404);
    await response.body?.cancel();
    assert.assertFalse(await runtime.fs.exists(markerPath));
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

Deno.test("POST /_rsc refuses a module the actions manifest does not list", async () => {
  await withActions(
    serverAction("echo", "(value) => value"),
    async (handler) => {
      const response = await postAction(handler, "actions#echo", "[1]");

      assert.assertEquals(response.status, 404);
      await response.body?.cancel();
    },
    false,
  );
});

Deno.test("POST /_rsc refuses a body over the limit with 413", async () => {
  await withActions(
    serverAction("echo", "(value) => value"),
    async (handler) => {
      const oversized = `["${"a".repeat(1_048_576)}"]`;

      const declared = await postAction(handler, "actions#echo", oversized);
      assert.assertEquals(declared.status, 413);
      await declared.body?.cancel();

      // Without Content-Length the bytes read are counted.
      const bytes = new TextEncoder().encode(oversized);
      const chunked = await postAction(
        handler,
        "actions#echo",
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
      );
      assert.assertEquals(chunked.status, 413);
      await chunked.body?.cancel();
    },
  );
});

Deno.test("POST /_rsc refuses cross-site requests and accepts same-origin ones", async () => {
  await withActions(
    serverAction("echo", "(value) => value"),
    async (handler) => {
      const cases: Array<[Record<string, string>, number]> = [
        [{ "Sec-Fetch-Site": "cross-site" }, 403],
        [{ "Sec-Fetch-Site": "same-site" }, 403],
        [{ Origin: "https://evil.example" }, 403],
        [{ "Sec-Fetch-Site": "same-origin" }, 200],
        [{ Origin: "http://localhost" }, 200],
      ];

      for (const [headers, status] of cases) {
        // Sequential: each case reads its own response before the next.
        // oxlint-disable-next-line no-await-in-loop
        const response = await postAction(
          handler,
          "actions#echo",
          "[1]",
          headers,
        );
        assert.assertEquals(response.status, status, JSON.stringify(headers));
        // oxlint-disable-next-line no-await-in-loop
        await response.body?.cancel();
      }
    },
  );
});

/** The value an action response carries. */
const readActionResult = async (response: Response): Promise<unknown> => {
  assert.assertExists(response.body);
  return await larouxClient.createValueFromReadableStream(response.body);
};

Deno.test("POST /_rsc runs the action of the build being served, also after a rebuild", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-actions-" });
  try {
    await writeActions(
      root,
      serverAction("version", '() => "action of build 1"'),
    );
    let servedBuildId = "build-1";
    const handler = server.createHandler({
      ...makeDeps(root),
      getBuildId: () => servedBuildId,
    });

    const first = await postAction(handler, "actions#version", "[]");
    // A dev rebuild rewrites the action module and serves a new build id
    await writeActions(
      root,
      serverAction("version", '() => "action of build 2"'),
    );
    servedBuildId = "build-2";
    const second = await postAction(handler, "actions#version", "[]");

    assert.assertEquals(await readActionResult(first), "action of build 1");
    assert.assertEquals(await readActionResult(second), "action of build 2");
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

Deno.test("GET / links the client bundle of the build on disk, also after a rebuild", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-page-" });
  try {
    // The manifest on disk belongs to the rebuild; the server was started
    // on an earlier build
    const rebuiltBundler: ServerDependencies["bundler"] = {
      getBundle: async () => {
        const bundle = await emptyBundler.getBundle();
        return {
          ...bundle,
          chunkManifest: { ...bundle.chunkManifest, buildId: "rebuilt" },
        };
      },
    };
    const handler = server.createHandler({
      ...makeDeps(root),
      bundler: rebuiltBundler,
      getBuildId: () => "started",
    });

    const html = await (await handler(new Request("http://localhost/"))).text();

    assert.assertStringIncludes(html, "/client.js?v=rebuilt");
    assert.assertEquals(html.includes("?v=started"), false);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

// ============================================================================
// Request data
// ============================================================================

Deno.test("/rsc renders concurrent requests with their own cookies", async () => {
  // Both pages wait until both renders have started, so the two requests
  // overlap: request data kept anywhere but the props would leak across.
  let started = 0;
  let releaseBoth = () => {};
  const bothStarted = new Promise<void>((resolve) => {
    releaseBoth = resolve;
  });

  const Layout = (props: larouxRouter.LayoutProps<React.ReactNode>) =>
    React.createElement(
      "main",
      { "data-host": props.request.host },
      props.children,
    );
  const Page = async (props: larouxRouter.PageProps) => {
    started++;
    if (started === 2) {
      releaseBoth();
    }
    await bothStarted;
    return React.createElement(
      "p",
      null,
      `user=${props.request.cookies.get("user")}`,
    );
  };

  const root = await runtime.fs.makeTempDir({ prefix: "laroux-request-" });
  try {
    const handler = server.createHandler(
      makeDeps(root, () => Promise.resolve({ Layout, Page, params: {} })),
    );
    const requestAs = (user: string, host: string) =>
      handler(
        new Request("http://localhost/rsc?pathname=/", {
          headers: { cookie: `theme=dark; user=${user}`, host },
        }),
      );

    const [aliceResponse, bobResponse] = await Promise.all([
      requestAs("alice", "alice.test"),
      requestAs("bob", "bob.test"),
    ]);
    const [alice, bob] = await Promise.all([
      aliceResponse.text(),
      bobResponse.text(),
    ]);

    assert.assertEquals(started, 2);
    assert.assertStringIncludes(alice, "user=alice");
    assert.assertStringIncludes(alice, "alice.test");
    assert.assertEquals(alice.includes("bob"), false);
    assert.assertStringIncludes(bob, "user=bob");
    assert.assertStringIncludes(bob, "bob.test");
    assert.assertEquals(bob.includes("alice"), false);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

// ============================================================================
// Proxies
// ============================================================================

/**
 * Write a proxy registry with a root proxy that counts the requests it sees
 * in `globalThis.rootProxyRuns`, and an /admin proxy that answers 403, then
 * load it into a dispatcher.
 */
const loadProxyFixture = async (
  root: string,
): Promise<middlewareDispatcher.MiddlewareDispatcher> => {
  const serverDir = runtime.path.join(root, "dist", "server");
  await runtime.fs.ensureDir(runtime.path.join(serverDir, "proxies"));
  await runtime.fs.writeTextFile(
    runtime.path.join(serverDir, "proxy-registry.ts"),
    `export const proxyRegistry = [
  { pathPrefix: "/", modulePath: "./proxies/root.ts" },
  { pathPrefix: "/admin", modulePath: "./proxies/admin.ts" },
];
`,
  );
  await runtime.fs.writeTextFile(
    runtime.path.join(serverDir, "proxies", "root.ts"),
    `export default ({ pathname }) => {
  globalThis.rootProxyRuns = [...(globalThis.rootProxyRuns ?? []), pathname];
  return { type: "next" };
};
`,
  );
  await runtime.fs.writeTextFile(
    runtime.path.join(serverDir, "proxies", "admin.ts"),
    `export default () => ({
  type: "response",
  response: new Response("forbidden", { status: 403 }),
});
`,
  );
  const dispatcher = new middlewareDispatcher.MiddlewareDispatcher();
  await dispatcher.loadProxies(runtime.path.join(root, "dist"), "server-test");
  return dispatcher;
};

const rootProxyRuns = (): string[] =>
  (globalThis as { rootProxyRuns?: string[] }).rootProxyRuns ?? [];

Deno.test("GET /rsc runs the proxy chain of the requested page", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-proxy-" });
  try {
    const Layout = (props: larouxRouter.LayoutProps<React.ReactNode>) =>
      React.createElement("main", null, props.children);
    const Page = () => React.createElement("p", null, "page content");
    const handler = server.createHandler({
      ...makeDeps(root, () => Promise.resolve({ Layout, Page, params: {} })),
      middlewareDispatcher: await loadProxyFixture(root),
    });

    const cases: Array<[string, number]> = [
      ["/admin", 403],
      ["/admin/users", 403],
      ["/x/../admin", 403],
      ["/about", 200],
    ];
    for (const [page, status] of cases) {
      // Sequential: each case reads its own response before the next.
      // oxlint-disable-next-line no-await-in-loop
      const response = await handler(
        new Request(
          `http://localhost/rsc?pathname=${encodeURIComponent(page)}`,
        ),
      );
      assert.assertEquals(response.status, status, page);
      // oxlint-disable-next-line no-await-in-loop
      const text = await response.text();
      if (status === 200) {
        assert.assertStringIncludes(text, "page content");
      } else {
        assert.assertFalse(text.includes("page content"));
      }
    }
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

Deno.test("POST /_rsc runs the root proxy chain", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-proxy-" });
  try {
    await writeActions(root, serverAction("echo", "(value) => value"));
    const handler = server.createHandler({
      ...makeDeps(root),
      middlewareDispatcher: await loadProxyFixture(root),
    });
    const before = rootProxyRuns().filter((path) => path === "/_rsc").length;

    const response = await postAction(handler, "actions#echo", "[1]");

    assert.assertEquals(response.status, 200);
    await response.body?.cancel();
    assert.assertEquals(
      rootProxyRuns().filter((path) => path === "/_rsc").length,
      before + 1,
    );
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

// ============================================================================
// Rate limiting
// ============================================================================

Deno.test("two peers with different remote addresses get separate rate-limit buckets", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-rate-" });
  try {
    const handler = server.createHandler({
      ...makeDeps(root),
      rateLimitConfig: { maxRequests: 1, windowMs: 60_000 },
    });
    const from = (hostname: string) => ({
      remoteAddr: { hostname, port: 40_000 },
    });
    const get = async (hostname: string): Promise<number> => {
      const response = await handler(
        new Request("http://localhost/missing"),
        from(hostname),
      );
      await response.body?.cancel();
      return response.status;
    };

    const first = await get("203.0.113.1");
    const second = await get("203.0.113.1");
    const otherPeer = await get("203.0.113.2");

    assert.assertNotEquals(first, 429);
    assert.assertEquals(second, 429);
    assert.assertNotEquals(otherPeer, 429);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

// ============================================================================
// Listening and HMR
// ============================================================================

Deno.test("startHTTPServer binds the configured host and serves the HMR WebSocket", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-listen-" });
  const stop = new AbortController();
  try {
    const hmr = new hmrManager.HMRManager();
    const deps = makeDeps(root);
    const listening = await server.startHTTPServer(
      {
        ...deps,
        config: {
          ...deps.config,
          server: { ...deps.config.server, host: "127.0.0.1", port: 0 },
        } as ServerDependencies["config"],
        hmrManager: hmr,
      },
      { signal: stop.signal },
    );

    assert.assertEquals(listening.hostname, "127.0.0.1");

    const socket = new WebSocket(`ws://127.0.0.1:${listening.port}/hmr`);
    const messages: string[] = [];
    const received = Promise.withResolvers<void>();
    socket.addEventListener("message", (event) => {
      messages.push(String(event.data));
      if (messages.some((m) => m.includes('"update"'))) {
        received.resolve();
      }
    });
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("no open")), {
        once: true,
      });
    });

    // The server registers the client before it answers the handshake.
    hmr.notifyUpdate(1);
    await received.promise;

    const closed = new Promise((resolve) =>
      socket.addEventListener("close", resolve, { once: true }),
    );
    socket.close();
    await closed;
    assert.assert(messages.some((m) => m.includes('"update"')));
  } finally {
    stop.abort();
    await runtime.fs.remove(root, { recursive: true });
  }
});
