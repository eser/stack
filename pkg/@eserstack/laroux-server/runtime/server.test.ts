// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as React from "react";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as config from "@eserstack/laroux/config";
import type * as larouxRouter from "@eserstack/laroux/router";
import * as larouxClient from "@eserstack/laroux-react/client";
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

/** Run a test with server actions written to dist/server/actions.js. */
const withActions = async (
  source: string,
  run: (handler: ReturnType<typeof server.createHandler>) => Promise<void>,
): Promise<void> => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-actions-" });
  try {
    const serverDir = runtime.path.join(root, "dist", "server");
    await runtime.fs.ensureDir(serverDir);
    await runtime.fs.writeTextFile(
      runtime.path.join(serverDir, "actions.js"),
      source,
    );
    await run(server.createHandler(makeDeps(root)));
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
};

const postAction = (
  handler: ReturnType<typeof server.createHandler>,
  actionId: string,
  body: string,
): Promise<Response> =>
  handler(
    new Request("http://localhost/_rsc", {
      method: "POST",
      headers: { "RSC-Action": actionId, "Content-Type": "application/json" },
      body,
    }),
  );

Deno.test("POST /_rsc sends an action's Date and Map result as RSC", async () => {
  await withActions(
    `export const stats = (label) => ({
      label,
      savedAt: new Date("2026-01-02T03:04:05.000Z"),
      counts: new Map([["views", 3]]),
    });\n`,
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
    "export const echo = (value) => value;\n",
    async (handler) => {
      for (const body of ['{"value":1}', "not json"]) {
        // Sequential: each case reads its own response before the next.
        // deno-lint-ignore no-await-in-loop
        const response = await postAction(handler, "actions#echo", body);
        assert.assertEquals(response.status, 400, body);
        // Reads the same case's body before the next case starts.
        // deno-lint-ignore no-await-in-loop
        assert.assertStringIncludes(await response.text(), "JSON array");
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
    const actionsPath = runtime.path.join(root, "dist", "server", "actions.js");
    await runtime.fs.ensureDir(runtime.path.dirname(actionsPath));
    await runtime.fs.writeTextFile(
      actionsPath,
      'export const version = () => "action of build 1";\n',
    );
    let servedBuildId = "build-1";
    const handler = server.createHandler({
      ...makeDeps(root),
      getBuildId: () => servedBuildId,
    });

    const first = await postAction(handler, "actions#version", "[]");
    // A dev rebuild rewrites the action module and serves a new build id
    await runtime.fs.writeTextFile(
      actionsPath,
      'export const version = () => "action of build 2";\n',
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
