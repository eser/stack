// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as nodeHttp from "./node-http.ts";
import * as httpScenario from "./testdata/http-scenario.ts";

// These tests run the Node adapter on Deno's node:http. node.test.ts runs the
// same contract on a real Node.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

nodeTest.test(
  "computeAcceptKey answers the handshake example of RFC 6455",
  () => {
    assert.assertEquals(
      nodeHttp.computeAcceptKey("dGhlIHNhbXBsZSBub25jZQ=="),
      "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
    );
  },
);

nodeTest.test(
  "serializeRawResponse frames the body itself and closes the connection",
  () => {
    const response = new Response("denied", {
      status: 403,
      headers: { "content-type": "text/plain", "content-length": "999" },
    });

    const bytes = nodeHttp.serializeRawResponse(response, encoder.encode("no"));

    assert.assertEquals(
      decoder.decode(bytes),
      "HTTP/1.1 403 Forbidden\r\n" +
        "content-type: text/plain\r\n" +
        "content-length: 2\r\n" +
        "connection: close\r\n" +
        "\r\n" +
        "no",
    );
  },
);

nodeTest.test(
  "serializeRawResponse keeps a status text the response sets",
  () => {
    const response = new Response(null, { status: 418, statusText: "Teapot" });

    const head = decoder.decode(
      nodeHttp.serializeRawResponse(response, new Uint8Array(0)),
    );

    assert.assertStringIncludes(head, "HTTP/1.1 418 Teapot\r\n");
  },
);

nodeTest.test("Node adapter runtime.http meets the HTTP contract", async () => {
  const result = await httpScenario.exerciseHttp(nodeHttp.createNodeHttp());

  assert.assertEquals(result, httpScenario.EXPECTED_HTTP_RESULT);
});

nodeTest.test(
  "Node adapter upgradeWebSocket refuses a request it did not serve",
  () => {
    const http = nodeHttp.createNodeHttp();
    const request = new Request("http://127.0.0.1/socket", {
      headers: {
        upgrade: "websocket",
        connection: "Upgrade",
        "sec-websocket-version": "13",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      },
    });

    assert.assertThrows(
      () => http.upgradeWebSocket(request),
      TypeError,
      "did not come from runtime.http.serve",
    );
  },
);

nodeTest.test("Node adapter serve rejects a port in use", async () => {
  const http = nodeHttp.createNodeHttp();
  const controller = new AbortController();
  const first = await http.serve(
    { port: 0, signal: controller.signal },
    () => new Response("first"),
  );

  try {
    await assert.assertRejects(() =>
      http.serve({ port: first.port }, () => new Response("second")),
    );
  } finally {
    controller.abort();
    await first.finished;
  }
});

nodeTest.test(
  "Node adapter serve stops at once on an aborted signal",
  async () => {
    const server = await nodeHttp
      .createNodeHttp()
      .serve(
        { port: 0, signal: AbortSignal.abort() },
        () => new Response("never"),
      );

    await server.finished;
  },
);

nodeTest.test(
  "Node adapter closes a socket whose client sends an unmasked frame",
  async () => {
    const http = nodeHttp.createNodeHttp();
    const controller = new AbortController();
    const serverSide: string[] = [];
    const serverClosed = Promise.withResolvers<void>();

    const server = await http.serve(
      { port: 0, signal: controller.signal },
      (request) => {
        const { socket, response } = http.upgradeWebSocket(request);
        socket.addEventListener("error", () => serverSide.push("error"));
        socket.addEventListener("close", (event) => {
          serverSide.push(`close:${event.code}`);
          serverClosed.resolve();
        });
        return response;
      },
    );

    // A raw connection, since a WebSocket client always masks its frames.
    const connection = await Deno.connect({
      hostname: "127.0.0.1",
      port: server.port,
    });
    let connectionOpen = true;

    try {
      await connection.write(
        encoder.encode(
          "GET /socket HTTP/1.1\r\n" +
            `Host: 127.0.0.1:${server.port}\r\n` +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Version: 13\r\n" +
            "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
        ),
      );
      // An unmasked text frame holding "x".
      await connection.write(new Uint8Array([0x81, 0x01, 0x78]));

      const received: number[] = [];
      const buffer = new Uint8Array(1024);
      while (true) {
        // The server's answer arrives in pieces until it closes the connection.
        // oxlint-disable-next-line no-await-in-loop
        const count = await connection.read(buffer);
        if (count === null) {
          break;
        }
        received.push(...buffer.subarray(0, count));
      }

      // The server has ended its side; closing ours lets the connection end.
      connection.close();
      connectionOpen = false;

      const text = decoder.decode(new Uint8Array(received));
      assert.assertStringIncludes(text, "HTTP/1.1 101 Switching Protocols\r\n");
      assert.assertStringIncludes(
        text,
        "Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n",
      );

      // The close frame with 1002 (protocol error) follows the handshake.
      const frameStart = text.indexOf("\r\n\r\n") + 4;
      assert.assertEquals(received.slice(frameStart), [0x88, 0x02, 0x03, 0xea]);

      await serverClosed.promise;
      assert.assertEquals(serverSide, ["error", "close:1006"]);
    } finally {
      if (connectionOpen) {
        connection.close();
      }
      controller.abort();
      await server.finished;
    }
  },
);
