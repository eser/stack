// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertThrows } from "@std/assert";
import {
  expectationFor,
  matchCallback,
  waitForOAuthCallback,
} from "./callback-server.ts";

const freePort = (): number => {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const { port } = listener.addr as Deno.NetAddr;
  listener.close();
  return port;
};

Deno.test("expectationFor accepts loopback redirect URIs only", () => {
  const e = expectationFor("http://localhost:3000/callback", "s1");
  assertEquals(e, {
    hostname: "127.0.0.1",
    port: 3000,
    pathname: "/callback",
    state: "s1",
  });
  assertEquals(expectationFor("http://[::1]:8080/cb", "s").hostname, "::1");
  assertThrows(() => expectationFor("http://0.0.0.0:8080/callback", "s"));
  assertThrows(() => expectationFor("http://example.com/callback", "s"));
});

Deno.test("matchCallback requires the redirect path and the issued state", () => {
  const e = expectationFor("http://127.0.0.1:8080/callback", "issued");
  const at = (q: string) =>
    matchCallback(new URL(`http://127.0.0.1:8080${q}`), e);
  assertEquals(at("/callback?code=c&state=issued"), "c");
  assertEquals(at("/callback?code=c&state=wrong"), null);
  assertEquals(at("/callback?code=c"), null);
  assertEquals(at("/other?code=c&state=issued"), null);
  assertEquals(
    matchCallback(
      new URL("http://127.0.0.1/callback?code=c&state="),
      { ...e, state: "" },
    ),
    null,
  );
});

Deno.test("a foreign request does not end the pending login", async () => {
  const port = freePort();
  const expected = expectationFor(
    `http://127.0.0.1:${port}/callback`,
    "issued-state",
  );
  const pending = waitForOAuthCallback(expected, 5_000);
  await new Promise((r) => setTimeout(r, 50));

  for (
    const q of [
      "/?code=ATTACKER",
      "/callback?code=ATTACKER",
      "/callback?code=ATTACKER&state=wrong",
    ]
  ) {
    const res = await fetch(`http://127.0.0.1:${port}${q}`);
    assertEquals(res.status, 400, q);
    await res.body?.cancel();
  }

  const ok = await fetch(
    `http://127.0.0.1:${port}/callback?code=GENUINE&state=issued-state`,
  );
  assertEquals(ok.status, 200);
  await ok.body?.cancel();

  assertEquals(await pending, { code: "GENUINE", state: "issued-state" });
});

Deno.test("the receiver binds loopback, not every interface", async () => {
  const port = freePort();
  const expected = expectationFor(`http://127.0.0.1:${port}/callback`, "s");
  const pending = waitForOAuthCallback(expected, 5_000);
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
    assertEquals(reachable, false, `listening on ${external.address}`);
  }

  const done = await fetch(`http://127.0.0.1:${port}/callback?code=x&state=s`);
  await done.body?.cancel();
  await pending;
});
