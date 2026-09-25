// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import * as path from "@std/path";
import { DEFAULT_CONFIG } from "@eserstack/laroux/config";
import { resolveWithin } from "./path-containment.ts";
import { createHandler, type ServerDependencies } from "./server.ts";

Deno.test("resolveWithin keeps children and rejects escapes", () => {
  const base = "/app/dist";

  assertEquals(resolveWithin(base, "server/a.js"), "/app/dist/server/a.js");
  assertEquals(resolveWithin(base, "..foo/a.js"), "/app/dist/..foo/a.js");
  assertEquals(resolveWithin(base, "../outside/evil.js"), null);
  assertEquals(resolveWithin(base, "a/../../x.js"), null);
  assertEquals(resolveWithin(base, "/app/dist-old/flag.txt"), null);
  assertEquals(resolveWithin(base, "/app/dist/server/a.js"), null);
  assertEquals(resolveWithin(base, ""), null);
  assertEquals(resolveWithin(base, "."), null);
  assertEquals(resolveWithin(base, "a\0.js"), null);
});

const makeDeps = (root: string): ServerDependencies => ({
  config: {
    ...DEFAULT_CONFIG,
    projectRoot: root,
    distDir: path.join(root, "dist"),
  } as unknown as ServerDependencies["config"],
  bundler: {} as ServerDependencies["bundler"],
  getApp: () => Promise.reject(new Error("not used")),
  buildId: "path-containment-test",
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
      `export const hello = (x) => "hello " + x;\n`,
    );

    const handler = createHandler(makeDeps(root));

    const attack = await postAction(handler, "../../outside/evil#pwn");
    assertEquals(attack.status, 400);
    await attack.body?.cancel();

    const absolute = await postAction(
      handler,
      `${path.join(outsideDir, "evil")}#pwn`,
    );
    assertEquals(absolute.status, 400);
    await absolute.body?.cancel();

    assertEquals(
      (globalThis as Record<string, unknown>)[marker],
      undefined,
    );

    const legit = await postAction(handler, "legit#hello");
    assertEquals(legit.status, 200);
    assertEquals(await legit.json(), "hello arg");
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

    const handler = createHandler(makeDeps(root));
    const target = path.join(root, "dist-secret", "flag.txt");

    const res = await handler(new Request(`http://localhost/dist/${target}`));
    const body = await res.text();
    assertEquals(res.status === 200 && body === "FLAG", false);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
