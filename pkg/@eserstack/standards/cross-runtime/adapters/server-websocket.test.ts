// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as serverWebSocket from "./server-websocket.ts";

/** A wire that records what the socket sends and closes with. */
const createFakeWire = (bufferedAfterSend = 0) => {
  const sent: (string | Uint8Array)[] = [];
  const closes: { code: number | null; reason: string }[] = [];

  const wire: serverWebSocket.WebSocketWire = {
    send: (data) => {
      sent.push(data);
      return bufferedAfterSend;
    },
    close: (code, reason) => {
      closes.push({ code, reason });
    },
  };

  return { wire, sent, closes };
};

const createSocket = (bufferedAfterSend = 0) => {
  const fake = createFakeWire(bufferedAfterSend);
  const { socket, events } = serverWebSocket.ServerWebSocket.create(
    "ws://127.0.0.1:8080/socket",
    fake.wire,
  );

  // Callers see the socket as a WebSocket, so the tests do too.
  const webSocket: WebSocket = socket;

  return { ...fake, socket: webSocket, events };
};

/** Records the type of every event the socket dispatches. */
const recordEvents = (socket: WebSocket): Event[] => {
  const seen: Event[] = [];
  for (const type of ["open", "message", "error", "close"]) {
    socket.addEventListener(type, (event) => seen.push(event));
  }

  return seen;
};

// =============================================================================
// Lifecycle
// =============================================================================

Deno.test("ServerWebSocket starts connecting and refuses to send", () => {
  const { socket, sent } = createSocket();

  assert.assertEquals(socket.readyState, WebSocket.CONNECTING);
  assert.assertEquals(socket.url, "ws://127.0.0.1:8080/socket");
  const error = assert.assertThrows(() => socket.send("early"), DOMException);
  assert.assertEquals(error.name, "InvalidStateError");
  assert.assertEquals(sent, []);
});

Deno.test("ServerWebSocket opens, then runs listeners and the onopen handler", () => {
  const { socket, events } = createSocket();
  const seen = recordEvents(socket);
  let handled = 0;
  socket.onopen = () => {
    handled++;
  };

  events.opened();

  assert.assertEquals(socket.readyState, WebSocket.OPEN);
  assert.assertEquals(seen.map((event) => event.type), ["open"]);
  assert.assertEquals(handled, 1);
});

Deno.test("ServerWebSocket closes with the code, reason and cleanness it is given", () => {
  const { socket, events } = createSocket();
  const seen = recordEvents(socket);
  let closeCode = 0;
  socket.onclose = (event) => {
    closeCode = event.code;
  };
  events.opened();

  events.closed(4001, "bye", true);
  events.closed(1006, "", false);

  assert.assertEquals(socket.readyState, WebSocket.CLOSED);
  const close = seen.at(-1);
  assert.assert(close instanceof CloseEvent);
  assert.assertEquals(
    [close.code, close.reason, close.wasClean],
    [4001, "bye", true],
  );
  assert.assertEquals(closeCode, 4001);
  // A second closed report changes nothing.
  assert.assertEquals(seen.map((event) => event.type), ["open", "close"]);
});

Deno.test("ServerWebSocket reports a failure as an error event", () => {
  const { socket, events } = createSocket();
  const seen = recordEvents(socket);
  events.opened();

  events.failed();
  events.closed(1006, "", false);

  assert.assertEquals(seen.map((event) => event.type), [
    "open",
    "error",
    "close",
  ]);
});

// =============================================================================
// Messages
// =============================================================================

Deno.test("ServerWebSocket delivers text as a string and bytes as an ArrayBuffer", () => {
  const { socket, events } = createSocket();
  const data: unknown[] = [];
  socket.onmessage = (event) => data.push(event.data);
  events.opened();

  events.received("text");
  events.received(new Uint8Array([1, 2, 3]));

  assert.assertEquals(data[0], "text");
  assert.assert(data[1] instanceof ArrayBuffer);
  assert.assertEquals(new Uint8Array(data[1]), new Uint8Array([1, 2, 3]));
});

Deno.test("ServerWebSocket delivers bytes as a Blob when binaryType is blob", async () => {
  const { socket, events } = createSocket();
  const data: unknown[] = [];
  socket.binaryType = "blob";
  socket.addEventListener("message", (event) => data.push(event.data));
  events.opened();

  events.received(new Uint8Array([104, 105]));

  assert.assert(data[0] instanceof Blob);
  assert.assertEquals(await data[0].text(), "hi");
});

Deno.test("ServerWebSocket drops messages that arrive after close()", () => {
  const { socket, events } = createSocket();
  const seen = recordEvents(socket);
  events.opened();

  socket.close();
  events.received("late");

  assert.assertEquals(seen.map((event) => event.type), ["open"]);
});

Deno.test("ServerWebSocket sends strings and every kind of bytes", () => {
  const { socket, events, sent } = createSocket();
  events.opened();
  const bytes = new Uint8Array([0, 1, 2, 3, 4]);

  socket.send("text");
  socket.send(bytes.buffer);
  socket.send(bytes.subarray(1, 3));
  socket.send(new DataView(bytes.buffer, 3, 2));

  assert.assertEquals(sent, [
    "text",
    new Uint8Array([0, 1, 2, 3, 4]),
    new Uint8Array([1, 2]),
    new Uint8Array([3, 4]),
  ]);
});

Deno.test("ServerWebSocket keeps a Blob in order with the messages after it", async () => {
  const { socket, events, sent } = createSocket();
  events.opened();

  socket.send(new Blob(["blob"]));
  socket.send("after");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.assertEquals(sent, [new TextEncoder().encode("blob"), "after"]);
});

Deno.test("ServerWebSocket tracks bufferedAmount from sends and drains", () => {
  const { socket, events } = createSocket(42);
  events.opened();

  socket.send("x");
  assert.assertEquals(socket.bufferedAmount, 42);

  events.drained();
  assert.assertEquals(socket.bufferedAmount, 0);
});

Deno.test("ServerWebSocket drops sends once it is closing", () => {
  const { socket, events, sent } = createSocket();
  events.opened();

  socket.close(1000);
  socket.send("late");

  assert.assertEquals(sent, []);
});

// =============================================================================
// close()
// =============================================================================

Deno.test("ServerWebSocket close() starts the closing handshake once", () => {
  const { socket, events, closes } = createSocket();
  events.opened();

  socket.close(4000, "done");
  socket.close(1000);

  assert.assertEquals(socket.readyState, WebSocket.CLOSING);
  assert.assertEquals(closes, [{ code: 4000, reason: "done" }]);
});

Deno.test("ServerWebSocket close() without a code sends a close frame without one", () => {
  const { socket, events, closes } = createSocket();
  events.opened();

  socket.close();

  assert.assertEquals(closes, [{ code: null, reason: "" }]);
});

Deno.test("ServerWebSocket close() while connecting closes as soon as it opens", () => {
  const { socket, events, closes } = createSocket();
  const seen = recordEvents(socket);

  socket.close(1000, "never mind");
  assert.assertEquals(closes, []);

  events.opened();

  assert.assertEquals(closes, [{ code: 1000, reason: "never mind" }]);
  assert.assertEquals(seen, []);
  assert.assertEquals(socket.readyState, WebSocket.CLOSING);
});

const invalidCloseCases = [
  {
    name: "a reserved code",
    code: 1001,
    reason: "",
    error: "InvalidAccessError",
  },
  {
    name: "a code below 1000",
    code: 999,
    reason: "",
    error: "InvalidAccessError",
  },
  {
    name: "a code above 4999",
    code: 5000,
    reason: "",
    error: "InvalidAccessError",
  },
  {
    name: "a reason over 123 bytes",
    code: 1000,
    reason: "x".repeat(124),
    error: "SyntaxError",
  },
];

for (const { name, code, reason, error } of invalidCloseCases) {
  Deno.test(`ServerWebSocket close() refuses ${name}`, () => {
    const { socket, events, closes } = createSocket();
    events.opened();

    const thrown = assert.assertThrows(
      () => socket.close(code, reason),
      DOMException,
    );

    assert.assertEquals(thrown.name, error);
    assert.assertEquals(closes, []);
    assert.assertEquals(socket.readyState, WebSocket.OPEN);
  });
}

// =============================================================================
// readHandshakeKey and toSocketUrl
// =============================================================================

const handshakeHeaders = {
  upgrade: "websocket",
  connection: "keep-alive, Upgrade",
  "sec-websocket-version": "13",
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
};

Deno.test("readHandshakeKey returns the key of a valid handshake", () => {
  const request = new Request("http://127.0.0.1/socket", {
    headers: handshakeHeaders,
  });

  assert.assertEquals(
    serverWebSocket.readHandshakeKey(request),
    "dGhlIHNhbXBsZSBub25jZQ==",
  );
});

const invalidHandshakeCases = [
  {
    name: "a POST request",
    method: "POST",
    headers: {},
    mentions: "method is POST",
  },
  {
    name: "a missing Upgrade header",
    method: "GET",
    headers: { upgrade: "" },
    mentions: "Upgrade header",
  },
  {
    name: "Upgrade: h2c",
    method: "GET",
    headers: { upgrade: "h2c" },
    mentions: "Upgrade header",
  },
  {
    name: "a Connection header without upgrade",
    method: "GET",
    headers: { connection: "keep-alive" },
    mentions: "Connection header",
  },
  {
    name: "protocol version 8",
    method: "GET",
    headers: { "sec-websocket-version": "8" },
    mentions: "Sec-WebSocket-Version",
  },
  {
    name: "a short key",
    method: "GET",
    headers: { "sec-websocket-key": "c2hvcnQ=" },
    mentions: "Sec-WebSocket-Key",
  },
];

for (const { name, method, headers, mentions } of invalidHandshakeCases) {
  Deno.test(`readHandshakeKey refuses ${name}`, () => {
    const request = new Request("http://127.0.0.1/socket", {
      method,
      headers: { ...handshakeHeaders, ...headers },
    });

    assert.assertThrows(
      () => serverWebSocket.readHandshakeKey(request),
      TypeError,
      mentions,
    );
  });
}

Deno.test("toSocketUrl swaps the HTTP scheme for the WebSocket one", () => {
  assert.assertEquals(
    serverWebSocket.toSocketUrl("http://127.0.0.1:8080/mux?token=x"),
    "ws://127.0.0.1:8080/mux?token=x",
  );
  assert.assertEquals(
    serverWebSocket.toSocketUrl("https://example.com/mux"),
    "wss://example.com/mux",
  );
});
