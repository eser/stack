// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as webtransport from "./mod.ts";

/** A stand-in for the browser's WebTransport object; tests drive its handshake. */
const createFakeTransport = (
  url: string,
  options: WebTransportOptions | undefined,
) => {
  const ready = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<WebTransportCloseInfo>();
  const closeCalls: Array<WebTransportCloseInfo | undefined> = [];
  let incoming:
    | ReadableStreamDefaultController<WebTransportBidirectionalStream>
    | null = null;

  const bidirectionalStream = {
    readable: new ReadableStream<Uint8Array>(),
    writable: new WritableStream<Uint8Array>(),
  } as unknown as WebTransportBidirectionalStream;
  const unidirectionalStream = new WritableStream<Uint8Array>();
  const datagrams = {
    readable: new ReadableStream<Uint8Array>(),
    writable: new WritableStream<Uint8Array>(),
  };

  const transport = {
    ready: ready.promise,
    closed: closed.promise,
    datagrams,
    incomingBidirectionalStreams: new ReadableStream<
      WebTransportBidirectionalStream
    >({
      start: (controller) => {
        incoming = controller;
      },
    }),
    createBidirectionalStream: () => Promise.resolve(bidirectionalStream),
    createUnidirectionalStream: () => Promise.resolve(unidirectionalStream),
    close: (closeInfo?: WebTransportCloseInfo) => {
      closeCalls.push(closeInfo);
      // Like the browser: closing a pending session fails its handshake.
      ready.reject(new Error("session closed before it was ready"));
      closed.resolve(closeInfo ?? {});
    },
  } as unknown as WebTransport;

  return {
    url,
    options,
    transport,
    closeCalls,
    bidirectionalStream,
    unidirectionalStream,
    datagrams,
    becomeReady: () => ready.resolve(),
    failHandshake: (error: Error) => ready.reject(error),
    pushIncoming: (stream: WebTransportBidirectionalStream) =>
      incoming?.enqueue(stream),
    endIncoming: () => incoming?.close(),
  };
};

type FakeTransport = ReturnType<typeof createFakeTransport>;

/**
 * A client whose transports are fakes. `onDial` runs for each one, so a test
 * can make it ready, fail it, or leave it pending.
 */
const createClient = (
  config: Omit<webtransport.WebTransportConfig, "_newTransport">,
  onDial: (fake: FakeTransport) => void = (fake) => fake.becomeReady(),
) => {
  const dialed: FakeTransport[] = [];
  const client = webtransport.createWebTransportClient({
    ...config,
    _newTransport: (url, options) => {
      const fake = createFakeTransport(url, options);
      dialed.push(fake);
      onDial(fake);
      return fake.transport;
    },
  });

  return { client, dialed };
};

const urlCases = [
  {
    name: "joins a path to baseUrl",
    baseUrl: "https://localhost:4433",
    target: "/attach/app/s-1",
    expected: "https://localhost:4433/attach/app/s-1",
  },
  {
    name:
      "joins a path without a leading slash to a baseUrl with a trailing one",
    baseUrl: "https://localhost:4433/",
    target: "attach/app/s-1",
    expected: "https://localhost:4433/attach/app/s-1",
  },
  {
    name: "keeps a full https URL as given",
    baseUrl: "https://localhost:4433",
    target: "https://other.example:8443/attach",
    expected: "https://other.example:8443/attach",
  },
  {
    name: "keeps a full http URL as given",
    baseUrl: "https://localhost:4433",
    target: "http://other.example/attach",
    expected: "http://other.example/attach",
  },
  {
    name: "uses the target as given when there is no baseUrl",
    baseUrl: undefined,
    target: "/attach",
    expected: "/attach",
  },
  {
    name: "uses the target as given when baseUrl is empty",
    baseUrl: "",
    target: "/attach",
    expected: "/attach",
  },
];

for (const { name, baseUrl, target, expected } of urlCases) {
  Deno.test(`connect ${name}`, async () => {
    const { client, dialed } = createClient({ baseUrl });

    await client.connect(target);

    assert.assertEquals(dialed.map((fake) => fake.url), [expected]);
  });
}

Deno.test("connect passes certHashes as sha-256 serverCertificateHashes", async () => {
  const hash = new Uint8Array([1, 2, 3]).buffer;
  const { client, dialed } = createClient({ certHashes: [hash] });

  await client.connect("https://localhost:4433/attach");

  assert.assertEquals(dialed[0]?.options, {
    serverCertificateHashes: [{ algorithm: "sha-256", value: hash }],
  });
});

const noPinCases = [
  { name: "unset", certHashes: undefined },
  { name: "empty", certHashes: [] },
];

for (const { name, certHashes } of noPinCases) {
  Deno.test(`connect pins no certificate when certHashes is ${name}`, async () => {
    const { client, dialed } = createClient({ certHashes });

    await client.connect("https://localhost:4433/attach");

    assert.assertEquals(dialed[0]?.options, {});
  });
}

Deno.test("connect resolves to a session over the dialed transport", async () => {
  const { client, dialed } = createClient({}, () => {});

  const connecting = client.connect("https://localhost:4433/attach");
  dialed[0]!.becomeReady();
  const session = await connecting;

  assert.assertStrictEquals(session.inner, dialed[0]!.transport);
});

const handshakeCases = [
  { name: "with no dialTimeout", dialTimeout: undefined },
  { name: "within dialTimeout", dialTimeout: 5_000 },
];

for (const { name, dialTimeout } of handshakeCases) {
  Deno.test(`connect rejects with the handshake error ${name}`, async () => {
    const { client } = createClient(
      { dialTimeout },
      (fake) => fake.failHandshake(new Error("certificate hash mismatch")),
    );

    await assert.assertRejects(
      () => client.connect("https://localhost:4433/attach"),
      Error,
      "certificate hash mismatch",
    );
  });
}

Deno.test("connect gives up after dialTimeout and closes the pending session", async () => {
  // The fake stays pending, so only the timeout can settle connect().
  const { client, dialed } = createClient({ dialTimeout: 20 }, () => {});

  const error = await assert.assertRejects(
    () => client.connect("https://localhost:4433/attach?token=secret"),
    Error,
    "WebTransport dial timed out after 20 ms",
  );

  assert.assertEquals(dialed[0]?.closeCalls.length, 1);
  // The URL can carry the session token, so the message leaves it out.
  assert.assertEquals(error.message.includes("secret"), false);
});

Deno.test({
  name: "connect clears its timer when the session is ready in time",
  // Off by default; on, it fails the test if the 60 s timer is left running.
  sanitizeOps: true,
  fn: async () => {
    const { client, dialed } = createClient({ dialTimeout: 60_000 });

    await client.connect("https://localhost:4433/attach");

    assert.assertEquals(dialed[0]?.closeCalls, []);
  },
});

Deno.test("session opens streams on the underlying transport", async () => {
  const { client, dialed } = createClient({});
  const session = await client.connect("https://localhost:4433/attach");
  const fake = dialed[0]!;

  assert.assertStrictEquals(
    await session.openBidirectionalStream(),
    fake.bidirectionalStream,
  );
  assert.assertStrictEquals(
    await session.openUnidirectionalStream(),
    fake.unidirectionalStream,
  );
  assert.assertStrictEquals(session.datagrams, fake.datagrams);
  assert.assertStrictEquals(session.ready, fake.transport.ready);
});

Deno.test("acceptBidirectionalStream hands out the server's streams one at a time", async () => {
  const { client, dialed } = createClient({});
  const session = await client.connect("https://localhost:4433/attach");
  const first = { id: 1 } as unknown as WebTransportBidirectionalStream;
  const second = { id: 2 } as unknown as WebTransportBidirectionalStream;

  dialed[0]!.pushIncoming(first);
  dialed[0]!.pushIncoming(second);

  assert.assertStrictEquals(await session.acceptBidirectionalStream(), first);
  // The reader lock was released, so the next accept can read again.
  assert.assertStrictEquals(await session.acceptBidirectionalStream(), second);
});

Deno.test("acceptBidirectionalStream rejects once the server stops sending streams", async () => {
  const { client, dialed } = createClient({});
  const session = await client.connect("https://localhost:4433/attach");

  dialed[0]!.endIncoming();

  await assert.assertRejects(
    () => session.acceptBidirectionalStream(),
    Error,
    "WebTransport session closed",
  );
});

Deno.test("close passes the close info to the transport", async () => {
  const { client, dialed } = createClient({});
  const session = await client.connect("https://localhost:4433/attach");

  session.close({ closeCode: 4000, reason: "done" });

  assert.assertEquals(dialed[0]?.closeCalls, [
    { closeCode: 4000, reason: "done" },
  ]);
  assert.assertEquals(await session.closed, {
    closeCode: 4000,
    reason: "done",
  });
});
