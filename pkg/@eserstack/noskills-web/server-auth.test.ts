// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * End-to-end checks against a live server: the attack in the audit finding must
 * actually be refused on the wire, not just by the guard helpers in isolation.
 */

import * as assert from "@eserstack/test-kit/assert";
import * as persistence from "@eserstack/noskills/persistence";
import * as noskills from "@eserstack/noskills/mod";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as server from "./server.ts";

const TOKEN = "test-token-" + "a".repeat(52);

const withServer = async (
  fn: (base: string) => Promise<void>,
  root: string = runtime.process.cwd(),
): Promise<void> => {
  const previous = runtime.env.get("NOSKILLS_WEB_TOKEN");
  runtime.env.set("NOSKILLS_WEB_TOKEN", TOKEN);

  // Port 0 lets the system pick a free port; onListen reports it once the
  // server accepts connections.
  const controller = new AbortController();
  const listening = Promise.withResolvers<number>();
  const running = server.startServer({
    root,
    port: 0,
    open: false,
    signal: controller.signal,
    onListen: (address) => listening.resolve(address.port),
  });
  // A server that cannot bind rejects before it listens.
  running.catch((error: unknown) => listening.reject(error));

  try {
    const port = await listening.promise;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    controller.abort();

    if (previous === undefined) {
      runtime.env.delete("NOSKILLS_WEB_TOKEN");
    } else {
      runtime.env.set("NOSKILLS_WEB_TOKEN", previous);
    }

    await running.catch(() => {});
  }
};

Deno.test({
  name: "/mux upgrade without a token is refused",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/mux`, {
        headers: { upgrade: "websocket" },
      });
      await res.body?.cancel();

      assert.assertEquals(res.status, 403);
    }),
});

Deno.test({
  name: "/mux upgrade from a foreign Origin is refused even with the token",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/mux?token=${TOKEN}`, {
        headers: { upgrade: "websocket", origin: "https://evil.example" },
      });
      await res.body?.cancel();

      assert.assertEquals(res.status, 403);
    }),
});

Deno.test({
  name: "POST /api/tab without a token is refused",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/api/tab`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      await res.body?.cancel();

      assert.assertEquals(res.status, 403);
    }),
});

Deno.test({
  name: "POST with a form content-type is refused (CSRF-simple request)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/api/tab`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-noskills-token": TOKEN,
        },
        body: "a=1",
      });
      await res.body?.cancel();

      assert.assertEquals(res.status, 403);
    }),
});

Deno.test({
  name: "the server's own Origin passes on the port the system picked",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      // Started with port 0: the Origin check must compare against the bound
      // port, or the dashboard's own requests would be refused.
      const res = await fetch(`${base}/api/spec/any-spec/no-such-action`, {
        method: "POST",
        headers: {
          origin: base,
          "content-type": "application/json",
          "x-noskills-token": TOKEN,
        },
        body: "{}",
      });
      const body = await res.json();

      assert.assertEquals(res.status, 400);
      assert.assertEquals(body.error, "Unknown action: no-such-action");
    }),
});

Deno.test({
  name: "a JSON body that is not an object is read as {}, not a server error",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/api/spec/any-spec/no-such-action`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-noskills-token": TOKEN,
        },
        body: "null",
      });
      const body = await res.json();

      assert.assertEquals(res.status, 400);
      assert.assertEquals(body, {
        ok: false,
        error: "Unknown action: no-such-action",
      });
    }),
});

Deno.test({
  name: "the dashboard still serves, and embeds the token for the browser",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withServer(async (base) => {
      const res = await fetch(`${base}/`);
      const html = await res.text();

      assert.assertEquals(res.status, 200);
      assert.assertEquals(
        html.includes(`<meta name="noskills-token" content="${TOKEN}" />`),
        true,
        "dashboard must hand the browser its token",
      );
    }),
});

/** A project root holding one spec directory per name, each in SPEC_PROPOSAL. */
const projectWithSpecs = async (...names: string[]): Promise<string> => {
  const root = await runtime.fs.makeTempDir();
  await persistence.scaffoldEserDir(root);

  for (const name of names) {
    let state = noskills.createInitialState();
    state = noskills.machine.startSpec(state, name, `spec/${name}`, "test");
    state = noskills.machine.completeDiscovery(state);
    state = noskills.machine.approveDiscoveryReview(state);

    // Each spec lives in its own directory.
    // deno-lint-ignore no-await-in-loop
    await runtime.fs.mkdir(`${root}/.eser/specs/${name}`, { recursive: true });
    // deno-lint-ignore no-await-in-loop
    await persistence.writeSpecState(root, name, state);
  }

  return root;
};

/** The token a page hands the browser, read as client.js reads it. */
const pageToken = (html: string): string | null =>
  html.match(/<meta name="noskills-token" content="([^"]+)" \/>/)?.[1] ?? null;

Deno.test({
  name: "the spec page embeds the token, so its buttons pass the guard",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const root = await projectWithSpecs("token-page");

    await withServer(async (base) => {
      const page = await fetch(`${base}/spec/token-page`);
      const token = pageToken(await page.text());

      assert.assertEquals(page.status, 200);
      assert.assertEquals(token, TOKEN);

      const res = await fetch(`${base}/api/spec/token-page/approve`, {
        method: "POST",
        headers: {
          origin: base,
          "content-type": "application/json",
          "x-noskills-token": token ?? "",
        },
        body: "{}",
      });

      assert.assertEquals(res.status, 200);
      assert.assertEquals(await res.json(), { ok: true });
    }, root);
  },
});

Deno.test({
  name: "the spec page decodes the name in its path",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const root = await projectWithSpecs("with space");

    await withServer(async (base) => {
      const res = await fetch(`${base}/spec/with%20space`);
      const html = await res.text();

      assert.assertEquals(res.status, 200);
      assert.assertStringIncludes(html, "<h1>with space ");
    }, root);
  },
});

Deno.test({
  name: "the spec page refuses a name that is not one directory",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const root = await projectWithSpecs();
    await runtime.fs.mkdir(`${root}/.eser/specs/outer/inner`, {
      recursive: true,
    });

    await withServer(async (base) => {
      for (const path of ["outer/inner", "outer%2Finner", "%E0%A4%A"]) {
        // The requests check one path each, in turn.
        // deno-lint-ignore no-await-in-loop
        const res = await fetch(`${base}/spec/${path}`);
        // deno-lint-ignore no-await-in-loop
        await res.body?.cancel();

        assert.assertEquals(res.status, 404, path);
      }
    }, root);
  },
});
