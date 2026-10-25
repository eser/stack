// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as net from "node:net";
import * as os from "node:os";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as callbackServer from "./callback-server.ts";

const freePort = async (): Promise<number> => {
  const listener = net.createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address() as net.AddressInfo;
  await new Promise<void>((resolve, reject) =>
    listener.close((err) => (err === undefined ? resolve() : reject(err))),
  );
  return port;
};

/** Resolves true when a TCP connection to host:port opens, false otherwise. */
const canConnect = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 1_000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });

nodeTest.test("expectationFor accepts loopback redirect URIs only", () => {
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
    callbackServer.expectationFor("http://0.0.0.0:8080/callback", "s"),
  );
  assert.assertThrows(() =>
    callbackServer.expectationFor("http://example.com/callback", "s"),
  );
});

nodeTest.test(
  "matchCallback requires the redirect path and the issued state",
  () => {
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
  },
);

nodeTest.test("a foreign request does not end the pending login", async () => {
  const port = await freePort();
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
  assert.assertEquals(
    foreignStatuses,
    foreignQueries.map(() => 400),
  );

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

nodeTest.test("the receiver binds loopback, not every interface", async () => {
  const port = await freePort();
  const expected = callbackServer.expectationFor(
    `http://127.0.0.1:${port}/callback`,
    "s",
  );
  const pending = callbackServer.waitForOAuthCallback(expected, 5_000);
  await new Promise((r) => setTimeout(r, 50));

  const external = Object.values(os.networkInterfaces())
    .flat()
    .find(
      (i) =>
        i !== undefined && i.family === "IPv4" && !i.address.startsWith("127."),
    );
  if (external !== undefined) {
    const reachable = await canConnect(external.address, port);
    assert.assertEquals(reachable, false, `listening on ${external.address}`);
  }

  const done = await fetch(`http://127.0.0.1:${port}/callback?code=x&state=s`);
  await done.body?.cancel();
  await pending;
});

nodeTest.test("the receiver times out", async () => {
  const port = await freePort();
  const expected = callbackServer.expectationFor(
    `http://127.0.0.1:${port}/callback`,
    "s",
  );

  // The promise settles only after the server has stopped, so a listener
  // left open would keep the port bound after the rejection.
  await assert.assertRejects(
    () => callbackServer.waitForOAuthCallback(expected, 50),
    Error,
    "timed out",
  );
});
