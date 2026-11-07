// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as net from "node:net";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "../mod.ts";
import * as nodeHttp from "./node-http.ts";
import * as httpScenario from "./testdata/http-scenario.ts";

// These tests run the Node adapter in the test process. node.test.ts runs the
// same contract in a child process.

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
    const connection = net.connect({ host: "127.0.0.1", port: server.port });

    try {
      const received: number[] = [];
      const ended = new Promise<void>((resolve, reject) => {
        connection.on("data", (chunk: Uint8Array) => received.push(...chunk));
        // The server's answer arrives in pieces until it closes the connection.
        connection.on("end", () => resolve());
        connection.on("error", reject);
      });

      connection.write(
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
      connection.write(new Uint8Array([0x81, 0x01, 0x78]));

      await ended;

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
      // A failed assertion must not leave the connection holding the server.
      connection.destroy();
      controller.abort();
      await server.finished;
    }
  },
);

// =============================================================================
// Serve options
// =============================================================================

/** Bounds a test that waits on a server, so a bug fails it instead of hanging. */
const TEST_LIMITS = { timeout: 30_000 } as const;

/** A shutdown limit no test reaches: reaching it fails the test by timeout. */
const NEVER_MS = 60_000;

/** A raw client connection and everything the server has sent on it. */
type RawClient = {
  readonly connection: net.Socket;
  /** Everything so far, as text. */
  readonly text: () => string;
  /** Everything so far, as bytes, for a WebSocket frame. */
  readonly bytes: () => readonly number[];
  /** Resolves once the server's output contains `expected`. */
  readonly received: (expected: string) => Promise<void>;
  /** Resolves with all the bytes once the connection has closed. */
  readonly closed: Promise<string>;
};

const connectRaw = (target: net.NetConnectOpts): RawClient => {
  const connection = net.connect(target);
  const waiting: { readonly expected: string; readonly done: () => void }[] =
    [];
  const bytes: number[] = [];
  let text = "";

  const closed = new Promise<string>((resolve) => {
    connection.on("close", () => resolve(text));
  });
  // A reset connection reports an error and then closes, which `closed` covers.
  connection.on("error", () => {});
  connection.on("data", (chunk: Uint8Array) => {
    bytes.push(...chunk);
    text += decoder.decode(chunk);
    for (const waiter of waiting) {
      if (text.includes(waiter.expected)) {
        waiter.done();
      }
    }
  });

  return {
    connection,
    text: () => text,
    bytes: () => bytes,
    received: (expected) =>
      new Promise((resolve) => {
        if (text.includes(expected)) {
          resolve();
        } else {
          waiting.push({ expected, done: resolve });
        }
      }),
    closed,
  };
};

const tcpTarget = (server: crossRuntime.HttpServer): net.NetConnectOpts => ({
  host: "127.0.0.1",
  port: server.port,
});

const plainRequest = (path: string, extraHeaders = ""): string =>
  `GET ${path} HTTP/1.1\r\nHost: test.local\r\n${extraHeaders}\r\n`;

const handshakeRequest = (path: string, extraHeaders = ""): string =>
  `GET ${path} HTTP/1.1\r\n` +
  "Host: test.local\r\n" +
  "Upgrade: websocket\r\n" +
  "Connection: Upgrade\r\n" +
  "Sec-WebSocket-Version: 13\r\n" +
  `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n${extraHeaders}\r\n`;

/** Resolves when a connection to `target` is refused. */
const connectionRefused = (target: net.NetConnectOpts): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = net.connect(target);
    probe.once("connect", () => {
      probe.destroy();
      resolve(false);
    });
    probe.once("error", () => resolve(true));
  });

nodeTest.describe("Node adapter graceful drain", () => {
  nodeTest.it(
    "lets an in-flight request finish, closes idle connections and refuses new ones",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();

      const server = await nodeHttp.createNodeHttp().serve(
        {
          port: 0,
          signal: controller.signal,
          shutdownTimeoutMs: NEVER_MS,
        },
        async (request) => {
          if (new URL(request.url).pathname === "/slow") {
            entered.resolve();
            await release.promise;
            return new Response("finished");
          }
          return new Response("fast");
        },
      );

      const idle = connectRaw(tcpTarget(server));
      const slow = connectRaw(tcpTarget(server));

      try {
        idle.connection.write(plainRequest("/fast"));
        await idle.received("fast");

        slow.connection.write(plainRequest("/slow"));
        await entered.promise;

        let stopped = false;
        const watched = server.finished.then(() => {
          stopped = true;
        });

        controller.abort();

        await idle.closed;
        assert.assert(await connectionRefused(tcpTarget(server)));
        assert.assertFalse(stopped);
        assert.assertEquals(slow.text(), "");

        release.resolve();

        const answer = await slow.closed;
        assert.assertStringIncludes(answer, "HTTP/1.1 200 OK\r\n");
        // It tells the client not to reuse the connection.
        assert.assertStringIncludes(answer.toLowerCase(), "connection: close");
        assert.assertStringIncludes(answer, "finished");

        await watched;
      } finally {
        release.resolve();
        idle.connection.destroy();
        slow.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it(
    "finishes a streaming response and then closes its kept-alive connection",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      const secondChunk = Promise.withResolvers<void>();

      const server = await nodeHttp.createNodeHttp().serve(
        {
          port: 0,
          signal: controller.signal,
          shutdownTimeoutMs: NEVER_MS,
          // Only the drain can close this connection once it is idle.
          keepAliveTimeoutMs: 0,
        },
        () =>
          new Response(
            new ReadableStream({
              async start(stream) {
                stream.enqueue(encoder.encode("first-part;"));
                await secondChunk.promise;
                stream.enqueue(encoder.encode("second-part;"));
                stream.close();
              },
            }),
          ),
      );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(plainRequest("/stream"));
        await client.received("first-part;");

        controller.abort();
        secondChunk.resolve();

        assert.assertStringIncludes(await client.closed, "second-part;");
        await server.finished;
      } finally {
        secondChunk.resolve();
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it(
    "closes what is left at the timeout, aborts its signal and cancels a late body",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      const entered = Promise.withResolvers<void>();
      const cancelled = Promise.withResolvers<void>();
      let signalAborted = false;

      const server = await nodeHttp
        .createNodeHttp()
        .serve(
          { port: 0, signal: controller.signal, shutdownTimeoutMs: 20 },
          async (request, info) => {
            entered.resolve();
            const aborted = Promise.withResolvers<void>();
            info.signal.addEventListener("abort", () => aborted.resolve());
            await aborted.promise;

            signalAborted = info.signal.aborted && request.signal.aborted;

            return new Response(
              new ReadableStream({
                cancel() {
                  cancelled.resolve();
                },
              }),
            );
          },
        );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(plainRequest("/never"));
        await entered.promise;

        controller.abort();

        await client.closed;
        await server.finished;
        await cancelled.promise;
        assert.assert(signalAborted);
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it(
    "cuts a stream that never ends at the timeout",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      const cancelled = Promise.withResolvers<void>();

      const server = await nodeHttp.createNodeHttp().serve(
        { port: 0, signal: controller.signal, shutdownTimeoutMs: 20 },
        () =>
          new Response(
            new ReadableStream({
              start(stream) {
                stream.enqueue(encoder.encode("event;"));
              },
              cancel() {
                cancelled.resolve();
              },
            }),
          ),
      );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(plainRequest("/events"));
        await client.received("event;");

        controller.abort();

        await client.closed;
        await server.finished;
        await cancelled.promise;
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it(
    "closes an in-flight request at once when the timeout is 0",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();

      const server = await nodeHttp
        .createNodeHttp()
        .serve(
          { port: 0, signal: controller.signal, shutdownTimeoutMs: 0 },
          async () => {
            entered.resolve();
            await release.promise;
            return new Response("late");
          },
        );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(plainRequest("/never"));
        await entered.promise;

        controller.abort();

        assert.assertEquals(await client.closed, "");
        await server.finished;
      } finally {
        release.resolve();
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it(
    "sends a WebSocket 1001 at once and drops it at the timeout if the client stays",
    TEST_LIMITS,
    async () => {
      const http = nodeHttp.createNodeHttp();
      const controller = new AbortController();
      const opened = Promise.withResolvers<void>();

      const server = await http.serve(
        { port: 0, signal: controller.signal, shutdownTimeoutMs: 20 },
        (request) => {
          const { socket, response } = http.upgradeWebSocket(request);
          socket.addEventListener("open", () => opened.resolve());
          return response;
        },
      );

      // A raw client that never answers the close frame, and that keeps its
      // side open when the server ends its own.
      const client = connectRaw({ ...tcpTarget(server), allowHalfOpen: true });
      const serverEnded = new Promise<void>((resolve) => {
        client.connection.once("end", () => resolve());
      });

      try {
        client.connection.write(handshakeRequest("/socket"));
        await opened.promise;

        controller.abort();

        // Under the 5 s a closing socket otherwise waits for its client.
        const closeWait = Promise.withResolvers<string>();
        const timer = setTimeout(
          () => closeWait.resolve("the close wait ran out"),
          4_000,
        );
        const outcome = await Promise.race([
          server.finished.then(() => "stopped"),
          closeWait.promise,
        ]);
        clearTimeout(timer);

        assert.assertEquals(outcome, "stopped");

        // The close frame with 1001 (going away) came first.
        await serverEnded;
        assert.assertEquals(client.bytes().slice(-4), [0x88, 0x02, 0x03, 0xe9]);
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it("refuses a timeout that is not a whole number", async () => {
    const http = nodeHttp.createNodeHttp();

    for (const name of [
      "shutdownTimeoutMs",
      "headersTimeoutMs",
      "requestTimeoutMs",
      "keepAliveTimeoutMs",
    ]) {
      for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        // oxlint-disable-next-line no-await-in-loop
        await assert.assertRejects(
          () =>
            http.serve({ port: 0, [name]: value }, () => new Response("never")),
          TypeError,
          name,
        );
      }
    }
  });
});

nodeTest.describe("Node adapter timeouts", () => {
  nodeTest.it(
    "headersTimeoutMs answers 408 when the headers do not arrive",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      const server = await nodeHttp
        .createNodeHttp()
        .serve(
          { port: 0, signal: controller.signal, headersTimeoutMs: 50 },
          () => new Response("never"),
        );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write("GET / HTTP/1.1\r\nHost: test.local\r\n");

        assert.assertStringIncludes(await client.closed, "HTTP/1.1 408 ");
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it(
    "requestTimeoutMs answers 408 when the body does not arrive",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      const server = await nodeHttp
        .createNodeHttp()
        .serve(
          { port: 0, signal: controller.signal, requestTimeoutMs: 50 },
          async (request, info) => {
            // The body never completes, and the handler holds until the server
            // gives up on the connection.
            const aborted = Promise.withResolvers<void>();
            info.signal.addEventListener("abort", () => aborted.resolve());
            request.text().catch(() => {});
            await aborted.promise;

            return new Response("never");
          },
        );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(
          "POST / HTTP/1.1\r\nHost: test.local\r\nContent-Length: 10\r\n\r\nabc",
        );

        assert.assertStringIncludes(await client.closed, "HTTP/1.1 408 ");
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it(
    "keepAliveTimeoutMs advertises the limit and closes an idle connection",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      const server = await nodeHttp
        .createNodeHttp()
        .serve(
          { port: 0, signal: controller.signal, keepAliveTimeoutMs: 1_000 },
          () => new Response("kept"),
        );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(plainRequest("/"));

        // The server closes it without being asked, while it keeps listening.
        const answer = await client.closed;
        assert.assertStringIncludes(answer, "Keep-Alive: timeout=1\r\n");
        assert.assertStringIncludes(answer, "kept");
        assert.assertFalse(await connectionRefused(tcpTarget(server)));
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it(
    "rejects a headers timeout above the request timeout",
    async () => {
      await assert.assertRejects(
        () =>
          nodeHttp
            .createNodeHttp()
            .serve(
              { port: 0, headersTimeoutMs: 2_000, requestTimeoutMs: 1_000 },
              () => new Response("never"),
            ),
        Error,
        "requestTimeout",
      );
    },
  );
});

nodeTest.describe(
  "Node adapter unix socket",
  { skip: crossRuntime.getPlatform() === "windows" && "no unix sockets here" },
  () => {
    const { runtime } = crossRuntime;
    const tempRoot = runtime.path.resolve(
      import.meta.dirname,
      "../../../../../etc/temp",
    );

    /** Runs `body` with a socket path in a directory it removes afterwards. */
    const withSocketPath = async (
      body: (path: string) => Promise<void>,
    ): Promise<void> => {
      await runtime.fs.mkdir(tempRoot, { recursive: true });
      const dir = await runtime.fs.makeTempDir({
        dir: tempRoot,
        prefix: "http-",
      });

      try {
        await body(runtime.path.join(dir, "s.sock"));
      } finally {
        await runtime.fs.remove(dir, { recursive: true });
      }
    };

    nodeTest.it(
      "serves on the path, reports it and removes the file when stopped",
      TEST_LIMITS,
      async () => {
        await withSocketPath(async (path) => {
          const controller = new AbortController();
          const seen: { url: string; info: unknown }[] = [];
          let listened: crossRuntime.ListenAddr | null = null;

          const server = await nodeHttp.createNodeHttp().serve(
            {
              port: 12_345,
              unixSocket: path,
              signal: controller.signal,
              onListen: (addr) => {
                listened = addr;
              },
            },
            (request, info) => {
              seen.push({ url: request.url, info: info.remoteAddr });
              return new Response("over a socket");
            },
          );

          const client = connectRaw({ path });

          try {
            assert.assertEquals(server.unixSocket, path);
            assert.assertEquals(server.hostname, "");
            assert.assertEquals(server.port, 0);
            assert.assertEquals(listened, {
              hostname: "",
              port: 0,
              unixSocket: path,
            });

            client.connection.write(
              plainRequest("/hello?a=1", "Connection: close\r\n"),
            );

            assert.assertStringIncludes(await client.closed, "over a socket");
            // A socket peer has no address, and the client's Host names the URL.
            assert.assertEquals(seen, [
              { url: "http://test.local/hello?a=1", info: null },
            ]);
          } finally {
            client.connection.destroy();
            controller.abort();
            await server.finished;
          }

          assert.assertFalse(await runtime.fs.exists(path));
        });
      },
    );

    nodeTest.it(
      "rejects a path in use and leaves the running server alone",
      TEST_LIMITS,
      async () => {
        await withSocketPath(async (path) => {
          const http = nodeHttp.createNodeHttp();
          const controller = new AbortController();
          const server = await http.serve(
            { port: 0, unixSocket: path, signal: controller.signal },
            () => new Response("first"),
          );

          const client = connectRaw({ path });

          try {
            await assert.assertRejects(
              () =>
                http.serve(
                  { port: 0, unixSocket: path },
                  () => new Response("second"),
                ),
              Error,
              "EADDRINUSE",
            );

            client.connection.write(plainRequest("/", "Connection: close\r\n"));
            assert.assertStringIncludes(await client.closed, "first");
          } finally {
            client.connection.destroy();
            controller.abort();
            await server.finished;
          }
        });
      },
    );

    nodeTest.it("rejects an empty path", async () => {
      await assert.assertRejects(
        () =>
          nodeHttp
            .createNodeHttp()
            .serve({ port: 0, unixSocket: "" }, () => new Response("never")),
        TypeError,
        "unixSocket is empty",
      );
    });

    nodeTest.it(
      "reads forwarded headers on the socket only with unix: in trustProxy",
      TEST_LIMITS,
      async () => {
        await withSocketPath(async (path) => {
          const forwardedHeaders =
            "X-Forwarded-For: 203.0.113.7\r\n" +
            "X-Forwarded-Proto: https\r\n" +
            "X-Forwarded-Host: app.example.com\r\n" +
            "Connection: close\r\n";

          const observe = async (
            trust: readonly string[] | undefined,
          ): Promise<unknown> => {
            const controller = new AbortController();
            let seen: unknown = null;
            const server = await nodeHttp.createNodeHttp().serve(
              {
                port: 0,
                unixSocket: path,
                signal: controller.signal,
                trustProxy: trust,
              },
              (request, info) => {
                seen = [request.url, info.remoteAddr];
                return new Response("ok");
              },
            );

            const client = connectRaw({ path });

            try {
              client.connection.write(plainRequest("/", forwardedHeaders));
              await client.closed;
              return seen;
            } finally {
              client.connection.destroy();
              controller.abort();
              await server.finished;
            }
          };

          assert.assertEquals(await observe(undefined), [
            "http://test.local/",
            null,
          ]);
          assert.assertEquals(await observe(["127.0.0.1"]), [
            "http://test.local/",
            null,
          ]);
          assert.assertEquals(await observe(["unix:"]), [
            "https://app.example.com/",
            { hostname: "203.0.113.7", port: 0 },
          ]);
        });
      },
    );
  },
);

nodeTest.describe("Node adapter trustProxy", () => {
  const SPOOFED_HEADERS: Readonly<Record<string, string>> = {
    "x-forwarded-for": "203.0.113.7",
    "x-forwarded-proto": "https",
    "x-forwarded-host": "app.example.com:8443",
  };

  /** What the handler saw for one request with the spoofed headers. */
  const observe = async (
    trust: readonly string[] | undefined,
  ): Promise<{ readonly url: string; readonly peer: unknown }> => {
    const controller = new AbortController();
    let seen: { url: string; peer: unknown } | null = null;

    const server = await nodeHttp
      .createNodeHttp()
      .serve(
        { port: 0, signal: controller.signal, trustProxy: trust },
        (request, info) => {
          seen = { url: request.url, peer: info.remoteAddr };
          return new Response("ok");
        },
      );

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/path?q=1`, {
        headers: SPOOFED_HEADERS,
      });
      await response.text();

      return seen!;
    } finally {
      controller.abort();
      await server.finished;
    }
  };

  nodeTest.it("ignores forwarded headers when it is off", async () => {
    const { url, peer } = await observe(undefined);
    const { hostname, port } = peer as crossRuntime.NetAddr;

    assert.assertEquals(new URL(url).protocol, "http:");
    assert.assertEquals(new URL(url).hostname, "127.0.0.1");
    assert.assertEquals(hostname, "127.0.0.1");
    assert.assert(port > 0);
  });

  nodeTest.it("ignores forwarded headers for an empty list", async () => {
    const { url, peer } = await observe([]);

    assert.assertEquals(new URL(url).protocol, "http:");
    assert.assertEquals((peer as crossRuntime.NetAddr).hostname, "127.0.0.1");
  });

  nodeTest.it("ignores forwarded headers from a peer not listed", async () => {
    const { url, peer } = await observe(["10.0.0.0/8"]);

    assert.assertEquals(new URL(url).protocol, "http:");
    assert.assertEquals(new URL(url).hostname, "127.0.0.1");
    assert.assertEquals((peer as crossRuntime.NetAddr).hostname, "127.0.0.1");
  });

  nodeTest.it("applies forwarded headers from a listed peer", async () => {
    const { url, peer } = await observe(["127.0.0.0/8"]);

    assert.assertEquals(url, "https://app.example.com:8443/path?q=1");
    assert.assertEquals(peer, { hostname: "203.0.113.7", port: 0 });
  });

  nodeTest.it("rejects an entry that is not an address", async () => {
    await assert.assertRejects(
      () =>
        nodeHttp
          .createNodeHttp()
          .serve(
            { port: 0, trustProxy: ["proxy.example.com"] },
            () => new Response("never"),
          ),
      TypeError,
      'trustProxy entry "proxy.example.com" is not valid',
    );
  });

  nodeTest.it(
    "sets the host of a request line in absolute form from the proxy's header",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      let seen = "";
      const server = await nodeHttp
        .createNodeHttp()
        .serve(
          { port: 0, signal: controller.signal, trustProxy: ["127.0.0.1"] },
          (request) => {
            seen = request.url;
            return new Response("ok");
          },
        );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(
          "GET http://evil.example.com:81/path HTTP/1.1\r\n" +
            "Host: test.local\r\n" +
            "X-Forwarded-Proto: https\r\n" +
            "X-Forwarded-Host: app.example.com\r\n" +
            "Connection: close\r\n\r\n",
        );
        await client.closed;

        assert.assertEquals(seen, "https://app.example.com/path");
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it(
    "applies to a WebSocket handshake from a listed peer",
    TEST_LIMITS,
    async () => {
      const http = nodeHttp.createNodeHttp();
      const controller = new AbortController();
      const seen: unknown[] = [];

      const server = await http.serve(
        {
          port: 0,
          signal: controller.signal,
          shutdownTimeoutMs: 0,
          trustProxy: ["127.0.0.1"],
        },
        (request, info) => {
          const { socket, response } = http.upgradeWebSocket(request);
          seen.push(socket.url, info.remoteAddr);
          return response;
        },
      );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(
          handshakeRequest(
            "/socket",
            "X-Forwarded-For: 203.0.113.7\r\n" +
              "X-Forwarded-Proto: https\r\n" +
              "X-Forwarded-Host: app.example.com\r\n",
          ),
        );
        await client.received("HTTP/1.1 101 ");

        assert.assertEquals(seen, [
          "wss://app.example.com/socket",
          { hostname: "203.0.113.7", port: 0 },
        ]);
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );
});

nodeTest.describe("Node adapter handler signal", () => {
  nodeTest.it(
    "aborts when the client disconnects during the handler",
    TEST_LIMITS,
    async () => {
      const controller = new AbortController();
      const entered = Promise.withResolvers<void>();
      const aborted = Promise.withResolvers<void>();

      const server = await nodeHttp
        .createNodeHttp()
        .serve(
          { port: 0, signal: controller.signal },
          async (_request, info) => {
            info.signal.addEventListener("abort", () => aborted.resolve());
            entered.resolve();
            await aborted.promise;
            return new Response("nobody reads this");
          },
        );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(plainRequest("/"));
        await entered.promise;

        client.connection.destroy();

        await aborted.promise;
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  nodeTest.it("stays quiet for a finished response", async () => {
    const controller = new AbortController();
    let signal: AbortSignal | null = null;

    const server = await nodeHttp
      .createNodeHttp()
      .serve({ port: 0, signal: controller.signal }, (_request, info) => {
        signal = info.signal;
        return new Response("done");
      });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/`);
      await response.text();
    } finally {
      controller.abort();
      await server.finished;
    }

    assert.assertFalse((signal as AbortSignal | null)?.aborted ?? true);
  });

  nodeTest.it(
    "aborts for a WebSocket handshake when its connection closes",
    TEST_LIMITS,
    async () => {
      const http = nodeHttp.createNodeHttp();
      const controller = new AbortController();
      const aborted = Promise.withResolvers<void>();

      const server = await http.serve(
        { port: 0, signal: controller.signal },
        (request, info) => {
          info.signal.addEventListener("abort", () => aborted.resolve());
          return http.upgradeWebSocket(request).response;
        },
      );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(handshakeRequest("/socket"));
        await client.received("HTTP/1.1 101 ");

        client.connection.destroy();

        await aborted.promise;
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );
});

nodeTest.describe("Node adapter upgrade identity", () => {
  /** Runs a client through `/socket` on a server wrapped by `wrap`. */
  const exercise = async (
    wrap: (handler: crossRuntime.HttpHandler) => crossRuntime.HttpHandler,
    onSocket: (socket: WebSocket) => void,
  ): Promise<{
    readonly opened: boolean;
    readonly messages: readonly string[];
  }> => {
    const http = nodeHttp.createNodeHttp();
    const controller = new AbortController();

    const server = await http.serve(
      { port: 0, signal: controller.signal },
      wrap((request) => {
        const { socket, response } = http.upgradeWebSocket(request);
        socket.addEventListener("message", (event) => socket.send(event.data));
        onSocket(socket);
        return response;
      }),
    );

    try {
      return await new Promise((resolve) => {
        const client = new WebSocket(`ws://127.0.0.1:${server.port}/socket`);
        const messages: string[] = [];
        let opened = false;

        client.onopen = () => {
          opened = true;
          client.send("echoed");
        };
        client.onmessage = (event) => {
          messages.push(String(event.data));
          client.close();
        };
        // A refused handshake reports an error, then the close below.
        client.onerror = () => {};
        client.onclose = () => resolve({ opened, messages });
      });
    } finally {
      controller.abort();
      await server.finished;
    }
  };

  nodeTest.it(
    "opens the socket through a wrapper that returns the same Response",
    TEST_LIMITS,
    async () => {
      const result = await exercise(
        (handler) => async (request, info) => {
          const response = await handler(request, info);

          // A wrapper adds its headers to other responses and passes this one
          // through as the same object.
          return response;
        },
        () => {},
      );

      assert.assertEquals(result, { opened: true, messages: ["echoed"] });
    },
  );

  nodeTest.it(
    "refuses the handshake and closes the socket for a wrapper that returns a copy",
    TEST_LIMITS,
    async () => {
      const serverClosed = Promise.withResolvers<number>();

      const result = await exercise(
        (handler) => async (request, info) => {
          const response = await handler(request, info);

          return new Response(response.body, response);
        },
        (socket) => {
          socket.addEventListener("close", (event) =>
            serverClosed.resolve(event.code),
          );
        },
      );

      assert.assertEquals(result, { opened: false, messages: [] });
      assert.assertEquals(await serverClosed.promise, 1006);
    },
  );
});

nodeTest.describe("Node adapter request target", () => {
  type Observed = {
    readonly status: string;
    readonly url: string | null;
    readonly port: number;
  };

  /** Sends `requestText(port)` on a raw socket; what the handler saw for it. */
  const observe = async (
    requestText: (port: number) => string,
    options: Partial<crossRuntime.ServeOptions> = {},
  ): Promise<Observed> => {
    const controller = new AbortController();
    let url: string | null = null;

    const server = await nodeHttp
      .createNodeHttp()
      .serve({ port: 0, signal: controller.signal, ...options }, (request) => {
        url = request.url;
        return new Response("ok");
      });

    const client = connectRaw(tcpTarget(server));

    try {
      client.connection.write(requestText(server.port));
      const answer = await client.closed;

      return {
        status: answer.slice(0, answer.indexOf("\r\n")),
        url,
        port: server.port,
      };
    } finally {
      client.connection.destroy();
      controller.abort();
      await server.finished;
    }
  };

  const get = (target: string, host = "test.local"): (() => string) => {
    return () =>
      `GET ${target} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`;
  };

  const keptOnHost: readonly (readonly [string, string])[] = [
    ["//evil.com/x", "http://test.local//evil.com/x"],
    ["///evil.com/x", "http://test.local///evil.com/x"],
    ["////evil.com/x", "http://test.local////evil.com/x"],
    ["//evil.com", "http://test.local//evil.com"],
    ["//evil.com:8080/x", "http://test.local//evil.com:8080/x"],
    ["//user@evil.com/x", "http://test.local//user@evil.com/x"],
    ["//evil.com/x?a=1", "http://test.local//evil.com/x?a=1"],
    // The URL parser reads a backslash in an http URL as a slash, so this one
    // takes the same path, and the backslash does not survive it.
    ["/\\evil.com/x", "http://test.local//evil.com/x"],
    ["/..//evil.com/x", "http://test.local//evil.com/x"],
  ];

  for (const [target, expected] of keptOnHost) {
    nodeTest.it(
      `keeps the host and the path for ${target}`,
      TEST_LIMITS,
      async () => {
        const { status, url } = await observe(get(target));

        assert.assertEquals(status, "HTTP/1.1 200 OK");
        assert.assertEquals(url, expected);
      },
    );
  }

  const unchanged: readonly (readonly [string, string])[] = [
    ["/", "http://test.local/"],
    ["/a/b", "http://test.local/a/b"],
    ["/a//b", "http://test.local/a//b"],
    ["/a///b/", "http://test.local/a///b/"],
    ["/a/../b", "http://test.local/b"],
    ["/a/%2F/b", "http://test.local/a/%2F/b"],
    ["/x?q=1&r=//y", "http://test.local/x?q=1&r=//y"],
    ["/x?next=http://evil.com/", "http://test.local/x?next=http://evil.com/"],
    ["/caf%C3%A9", "http://test.local/caf%C3%A9"],
    ["*", "http://test.local/*"],
  ];

  for (const [target, expected] of unchanged) {
    nodeTest.it(`leaves ${target} as it was`, TEST_LIMITS, async () => {
      const { status, url } = await observe(get(target));

      assert.assertEquals(status, "HTTP/1.1 200 OK");
      assert.assertEquals(url, expected);
    });
  }

  nodeTest.it(
    "uses the server's address for a double slash without a Host",
    TEST_LIMITS,
    async () => {
      const { url, port } = await observe(
        () => "GET //evil.com/x HTTP/1.0\r\n\r\n",
      );

      assert.assertEquals(url, `http://127.0.0.1:${port}//evil.com/x`);
    },
  );

  nodeTest.it(
    "keeps the Host's port for a double slash",
    TEST_LIMITS,
    async () => {
      const { url } = await observe(get("//evil.com/x", "test.local:8080"));

      assert.assertEquals(url, "http://test.local:8080//evil.com/x");
    },
  );

  nodeTest.it(
    "takes only the host from a Host with a path or a query",
    TEST_LIMITS,
    async () => {
      const withPath = await observe(get("/x?a=1", "test.local/base"));
      const withQuery = await observe(get("/x", "test.local?q=1"));

      assert.assertEquals(withPath.url, "http://test.local/x?a=1");
      assert.assertEquals(withQuery.url, "http://test.local/x");
    },
  );

  nodeTest.it(
    "answers 400 to a Host with credentials",
    TEST_LIMITS,
    async () => {
      const { status, url } = await observe(
        get("//evil.com/x", "user@test.local"),
      );

      assert.assertEquals(status, "HTTP/1.1 400 Bad Request");
      assert.assertEquals(url, null);
    },
  );

  nodeTest.it(
    "a forwarded host from a trusted proxy still applies to a double slash",
    TEST_LIMITS,
    async () => {
      const { url } = await observe(
        () =>
          "GET //evil.com/x HTTP/1.1\r\n" +
          "Host: test.local\r\n" +
          "X-Forwarded-Proto: https\r\n" +
          "X-Forwarded-Host: app.example.com\r\n" +
          "Connection: close\r\n\r\n",
        { trustProxy: ["127.0.0.1"] },
      );

      assert.assertEquals(url, "https://app.example.com//evil.com/x");
    },
  );

  nodeTest.it(
    "keeps the host of a WebSocket handshake with a double slash",
    TEST_LIMITS,
    async () => {
      const http = nodeHttp.createNodeHttp();
      const controller = new AbortController();
      const seen: string[] = [];

      const server = await http.serve(
        { port: 0, signal: controller.signal, shutdownTimeoutMs: 0 },
        (request) => {
          const { socket, response } = http.upgradeWebSocket(request);
          seen.push(request.url, socket.url);
          return response;
        },
      );

      const client = connectRaw(tcpTarget(server));

      try {
        client.connection.write(handshakeRequest("//evil.com/socket"));
        await client.received("HTTP/1.1 101 ");

        assert.assertEquals(seen, [
          "http://test.local//evil.com/socket",
          "ws://test.local//evil.com/socket",
        ]);
      } finally {
        client.connection.destroy();
        controller.abort();
        await server.finished;
      }
    },
  );

  // RFC 9112, 3.2.2: a server takes the host of an absolute-form target and
  // ignores the Host header. A client that can send this can set Host as well.
  const absoluteForm: readonly (readonly [string, string])[] = [
    ["http://evil.com/x", "http://evil.com/x"],
    ["http://evil.com//a//b?q=1", "http://evil.com//a//b?q=1"],
    ["https://evil.com/x", "https://evil.com/x"],
  ];

  for (const [target, expected] of absoluteForm) {
    nodeTest.it(
      `takes the host of the absolute-form target ${target}`,
      TEST_LIMITS,
      async () => {
        const { status, url } = await observe(get(target));

        assert.assertEquals(status, "HTTP/1.1 200 OK");
        assert.assertEquals(url, expected);
      },
    );
  }

  nodeTest.it(
    "answers 400 to an absolute-form target with credentials",
    TEST_LIMITS,
    async () => {
      const { status, url } = await observe(get("http://u:p@evil.com/x"));

      assert.assertEquals(status, "HTTP/1.1 400 Bad Request");
      assert.assertEquals(url, null);
    },
  );
});
