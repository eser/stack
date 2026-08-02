// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { wsTransport } from "./transport-ws.ts";

/**
 * A minimal in-memory `WebSocket` stand-in. Two fakes can be linked so a frame
 * sent on one is delivered to the other, modelling a connected client/server
 * pair without any real I/O.
 */
class FakeWebSocket extends EventTarget {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.OPEN;
  peer: FakeWebSocket | null = null;
  readonly sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
    // Deliver to the peer's message listeners on a microtask, like a real socket.
    const peer = this.peer;
    if (peer === null) return;
    queueMicrotask(() => {
      peer.dispatchEvent(new MessageEvent("message", { data }));
    });
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

const linkedPair = (): readonly [FakeWebSocket, FakeWebSocket] => {
  const a = new FakeWebSocket();
  const b = new FakeWebSocket();
  a.peer = b;
  b.peer = a;
  return [a, b];
};

type Ping = { readonly t: "ping"; readonly n: number };

Deno.test("wsTransport round-trips JSON messages between two sockets", async () => {
  const [sa, sb] = linkedPair();
  const ta = wsTransport<Ping, Ping>(sa as unknown as WebSocket);
  const tb = wsTransport<Ping, Ping>(sb as unknown as WebSocket);

  const received: Ping[] = [];
  tb.onMessage((m) => received.push(m));

  ta.send({ t: "ping", n: 1 });
  ta.send({ t: "ping", n: 2 });
  await new Promise((r) => queueMicrotask(() => r(undefined)));

  assertEquals(received, [{ t: "ping", n: 1 }, { t: "ping", n: 2 }]);
});

Deno.test("wsTransport drops sends when the socket is not open", () => {
  const [sa] = linkedPair();
  sa.readyState = FakeWebSocket.CLOSED;
  const ta = wsTransport<Ping, Ping>(sa as unknown as WebSocket);

  ta.send({ t: "ping", n: 1 });
  assertEquals(sa.sent, []);
});

Deno.test("wsTransport ignores non-string and malformed frames", async () => {
  const [sa, sb] = linkedPair();
  const ta = wsTransport<Ping, Ping>(sa as unknown as WebSocket);
  const tb = wsTransport<Ping, Ping>(sb as unknown as WebSocket);

  const received: Ping[] = [];
  tb.onMessage((m) => received.push(m));

  // Binary frame: ignored.
  sb.dispatchEvent(new MessageEvent("message", { data: new ArrayBuffer(4) }));
  // Malformed JSON: ignored, no throw.
  sb.dispatchEvent(new MessageEvent("message", { data: "{not json" }));
  // A good frame still gets through afterwards.
  ta.send({ t: "ping", n: 7 });
  await new Promise((r) => queueMicrotask(() => r(undefined)));

  assertEquals(received, [{ t: "ping", n: 7 }]);
});

Deno.test("wsTransport invokes onClose when the socket closes", () => {
  const [sa] = linkedPair();
  let closed = false;
  wsTransport<Ping, Ping>(sa as unknown as WebSocket, {
    onClose: () => {
      closed = true;
    },
  });

  sa.close();
  assertEquals(closed, true);
});
