// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as callbackServer from "./callback-server.ts";

const freePort = (): number => {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = listener.addr as Deno.NetAddr;
  listener.close();
  return port;
};

Deno.test("expectationFor accepts loopback redirect URIs only", () => {
  const e = callbackServer.expectationFor(
    "http://localhost:3000/callback",
    "s1",
  );
  assert.assertEquals(e, {
    hostname: "127.0.0.1",
    port: 3000,
    pathname: "/callback",
    state: "s1",
  });
  assert.assertEquals(
    callbackServer.expectationFor("http://[::1]:8080/cb", "s").hostname,
    "::1",
  );
  assert.assertThrows(() =>
    callbackServer.expectationFor("http://0.0.0.0:8080/callback", "s")
  );
  assert.assertThrows(() =>
    callbackServer.expectationFor("http://example.com/callback", "s")
  );
});

Deno.test("matchCallback requires the redirect path and the issued state", () => {
  const e = callbackServer.expectationFor(
    "http://127.0.0.1:8080/callback",
    "issued",
  );
  const at = (q: string) =>
    callbackServer.matchCallback(new URL(`http://127.0.0.1:8080${q}`), e);
  assert.assertEquals(at("/callback?code=c&state=issued"), "c");
  assert.assertEquals(at("/callback?code=c&state=wrong"), null);
  assert.assertEquals(at("/callback?code=c"), null);
  assert.assertEquals(at("/other?code=c&state=issued"), null);
  assert.assertEquals(
    callbackServer.matchCallback(
      new URL("http://127.0.0.1/callback?code=c&state="),
      { ...e, state: "" },
    ),
    null,
  );
});

Deno.test("a foreign request does not end the pending login", async () => {
  const port = freePort();
  const expected = callbackServer.expectationFor(
    `http://127.0.0.1:${port}/callback`,
    "issued-state",
  );
  const pending = callbackServer.waitForOAuthCallback(expected, 5_000);
  await new Promise((r) => setTimeout(r, 50));

  const foreignQueries = [
    "/?code=ATTACKER",
    "/callback?code=ATTACKER",
    "/callback?code=ATTACKER&state=wrong",
  ];
  // The foreign requests do not depend on each other, so they run
  // concurrently; the genuine callback below is sent after all are rejected.
  const foreignStatuses = await Promise.all(
    foreignQueries.map(async (q) => {
      const res = await fetch(`http://127.0.0.1:${port}${q}`);
      await res.body?.cancel();
      return res.status;
    }),
  );
  assert.assertEquals(foreignStatuses, foreignQueries.map(() => 400));

  const ok = await fetch(
    `http://127.0.0.1:${port}/callback?code=GENUINE&state=issued-state`,
  );
  assert.assertEquals(ok.status, 200);
  await ok.body?.cancel();

  assert.assertEquals(await pending, {
    code: "GENUINE",
    state: "issued-state",
  });
});

Deno.test("the receiver binds loopback, not every interface", async () => {
  const port = freePort();
  const expected = callbackServer.expectationFor(
    `http://127.0.0.1:${port}/callback`,
    "s",
  );
  const pending = callbackServer.waitForOAuthCallback(expected, 5_000);
  await new Promise((r) => setTimeout(r, 50));

  const external = Deno.networkInterfaces().find((i) =>
    i.family === "IPv4" && !i.address.startsWith("127.")
  );
  if (external !== undefined) {
    let reachable = true;
    try {
      const conn = await Deno.connect({ hostname: external.address, port });
      conn.close();
    } catch {
      reachable = false;
    }
    assert.assertEquals(reachable, false, `listening on ${external.address}`);
  }

  const done = await fetch(`http://127.0.0.1:${port}/callback?code=x&state=s`);
  await done.body?.cancel();
  await pending;
});
