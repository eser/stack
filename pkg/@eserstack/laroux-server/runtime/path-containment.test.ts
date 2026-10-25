// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as path from "@std/path";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as config from "@eserstack/laroux/config";
import * as larouxClient from "@eserstack/laroux-react/client";
import * as pathContainment from "./path-containment.ts";
import * as server from "./server.ts";
import type { ServerDependencies } from "./server.ts";

Deno.test("resolveWithin keeps children and rejects escapes", () => {
  const base = "/app/dist";

  assert.assertEquals(
    pathContainment.resolveWithin(base, "server/a.js"),
    "/app/dist/server/a.js",
  );
  assert.assertEquals(
    pathContainment.resolveWithin(base, "..foo/a.js"),
    "/app/dist/..foo/a.js",
  );
  assert.assertEquals(
    pathContainment.resolveWithin(base, "../outside/evil.js"),
    null,
  );
  assert.assertEquals(
    pathContainment.resolveWithin(base, "a/../../x.js"),
    null,
  );
  assert.assertEquals(
    pathContainment.resolveWithin(base, "/app/dist-old/flag.txt"),
    null,
  );
  assert.assertEquals(
    pathContainment.resolveWithin(base, "/app/dist/server/a.js"),
    null,
  );
  assert.assertEquals(pathContainment.resolveWithin(base, ""), null);
  assert.assertEquals(pathContainment.resolveWithin(base, "."), null);
  assert.assertEquals(pathContainment.resolveWithin(base, "a\0.js"), null);
});

const makeDeps = (root: string): ServerDependencies => ({
  config: {
    ...config.DEFAULT_CONFIG,
    projectRoot: root,
    distDir: path.join(root, "dist"),
  } as unknown as ServerDependencies["config"],
  bundler: {} as ServerDependencies["bundler"],
  getApp: () => Promise.reject(new Error("not used")),
  getBuildId: () => "path-containment-test",
  rateLimitConfig: false,
});

const postAction = (
  handler: (req: Request) => Promise<Response>,
  actionId: string,
): Promise<Response> =>
  handler(
    new Request("http://localhost/_rsc", {
      method: "POST",
      headers: { "RSC-Action": actionId, "Content-Type": "application/json" },
      body: JSON.stringify(["arg"]),
    }),
  );

Deno.test("POST /_rsc never imports a module outside dist/server", async () => {
  const root = await Deno.makeTempDir();
  try {
    const serverDir = path.join(root, "dist", "server");
    const outsideDir = path.join(root, "outside");
    await Deno.mkdir(serverDir, { recursive: true });
    await Deno.mkdir(outsideDir, { recursive: true });

    const marker = `__laroux_outside_${
      crypto.randomUUID().replaceAll("-", "")
    }`;
    await Deno.writeTextFile(
      path.join(outsideDir, "evil.js"),
      `globalThis.${marker} = true;\nexport const pwn = () => "pwned";\n`,
    );
    await Deno.writeTextFile(
      path.join(serverDir, "legit.js"),
      `export const hello = (x) => "hello " + x;
Object.defineProperties(hello, {
  $$typeof: { value: Symbol.for("react.server.reference") },
  $$id: { value: "legit#hello" },
});
`,
    );
    // The manifest lists the outside paths too, so this test reaches the
    // containment check behind the manifest check.
    await Deno.writeTextFile(
      path.join(serverDir, "actions-manifest.json"),
      JSON.stringify({
        actions: [
          "legit.js",
          "../../outside/evil.js",
          `${path.join(outsideDir, "evil")}.js`,
        ],
      }),
    );

    const handler = server.createHandler({
      ...makeDeps(root),
      bundler: {
        getBundle: () =>
          Promise.resolve({
            clientCode: null,
            moduleMap: {},
            chunkManifest: {
              version: "1",
              buildId: "path-containment-test",
              timestamp: 0,
              entrypoint: "client.js",
              logLevel: "info",
              chunks: {},
              files: {},
            },
            entrypoint: "/client.js",
          }),
      },
    });

    const attack = await postAction(handler, "../../outside/evil#pwn");
    assert.assertEquals(attack.status, 400);
    await attack.body?.cancel();

    const absolute = await postAction(
      handler,
      `${path.join(outsideDir, "evil")}#pwn`,
    );
    assert.assertEquals(absolute.status, 400);
    await absolute.body?.cancel();

    assert.assertEquals(
      (globalThis as Record<string, unknown>)[marker],
      undefined,
    );

    const legit = await postAction(handler, "legit#hello");
    assert.assertEquals(legit.status, 200);
    assert.assertExists(legit.body);
    assert.assertEquals(
      await larouxClient.createValueFromReadableStream(legit.body),
      "hello arg",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("static routes reject absolute and sibling-prefix paths", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(path.join(root, "dist"), { recursive: true });
    await Deno.mkdir(path.join(root, "dist-secret"), { recursive: true });
    await Deno.writeTextFile(
      path.join(root, "dist-secret", "flag.txt"),
      "FLAG",
    );

    const handler = server.createHandler(makeDeps(root));
    const target = path.join(root, "dist-secret", "flag.txt");

    const res = await handler(new Request(`http://localhost/dist/${target}`));
    const body = await res.text();
    assert.assertEquals(res.status === 200 && body === "FLAG", false);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("static routes do not serve server code or build inputs from dist", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "laroux-static-" });
  try {
    const files = {
      "dist/server/src/app/actions.js": "export const secret = 'server';",
      "dist/_laroux-react/client.ts": "export const bootstrap = true;",
      "dist/transform-manifest.json": "{}",
      "dist/client/client.js": "export const client = true;",
      "dist/robots.txt": "User-agent: *",
    };
    await Promise.all(
      Object.entries(files).map(async ([file, content]) => {
        const filePath = runtime.path.join(root, file);
        await runtime.fs.ensureDir(runtime.path.dirname(filePath));
        await runtime.fs.writeTextFile(filePath, content);
      }),
    );

    const handler = server.createHandler(makeDeps(root));
    const fetchBody = async (url: string) => {
      const res = await handler(new Request(url));
      return { status: res.status, body: await res.text() };
    };

    for (
      const url of [
        "http://localhost/dist/server/src/app/actions.js",
        "http://localhost/server/src/app/actions.js",
        "http://localhost/dist/client/../server/src/app/actions.js",
        // A case-insensitive file system (macOS, Windows) finds the same file
        // under another spelling.
        "http://localhost/dist/SERVER/src/app/actions.js",
        "http://localhost/Server/src/app/actions.js",
        "http://localhost/_laroux-react/client.ts",
        "http://localhost/transform-manifest.json",
      ]
    ) {
      // Sequential: each request goes through the same handler and its logs.
      // deno-lint-ignore no-await-in-loop
      const { status, body } = await fetchBody(url);
      assert.assertNotEquals(status, 200, url);
      assert.assertEquals(body.includes("export const"), false, url);
    }

    const client = await fetchBody("http://localhost/client.js");
    assert.assertEquals(client.status, 200);
    const robots = await fetchBody("http://localhost/robots.txt");
    assert.assertEquals(robots, { status: 200, body: "User-agent: *" });
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});
