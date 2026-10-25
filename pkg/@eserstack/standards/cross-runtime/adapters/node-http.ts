// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `runtime.http` for the Node adapter.
 *
 * Node's HTTP server works with IncomingMessage and ServerResponse and has no
 * WebSocket server. This module turns each request into a fetch `Request`,
 * writes the handler's `Response` back, and runs WebSockets over the raw socket
 * of an HTTP upgrade with the framing in websocket-frames.ts.
 *
 * @module
 */

import type {
  HttpHandler,
  HttpServer,
  RuntimeHttp,
  ServeHandlerInfo,
  ServeOptions,
  WebSocketUpgrade,
} from "../types.ts";
import * as deps from "./deps.ts";
import * as serverWebSocket from "./server-websocket.ts";
import * as shared from "./shared.ts";
import * as frames from "./websocket-frames.ts";

/** The largest WebSocket message a client may send: 16 MiB. */
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

/**
 * How long a closing WebSocket waits for the client's close frame and its end
 * of the connection before it drops the connection.
 */
const CLOSE_TIMEOUT_MS = 5_000;

/** The GUID RFC 6455 (4.2.2) appends to the client's key before hashing. */
const HANDSHAKE_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Headers that a raw response sets itself, from the body it sends. */
const FRAMING_HEADERS: ReadonlySet<string> = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

const encoder = new TextEncoder();

/** The raw socket Node hands over with an upgrade request. */
type RawSocket = deps.stream.Duplex;

/**
 * The handler info for a request on `socket`: its remote address, which a
 * net.Socket carries and which is gone once the socket has closed.
 */
const handlerInfo = (socket: unknown): ServeHandlerInfo => {
  const peer = socket as { remoteAddress?: string; remotePort?: number };

  return {
    remoteAddr:
      peer.remoteAddress !== undefined && peer.remotePort !== undefined
        ? { hostname: peer.remoteAddress, port: peer.remotePort }
        : null,
  };
};

/** One WebSocket running over a raw socket. */
type Connection = {
  readonly socket: WebSocket;
  /** Sends the handshake response and starts reading frames. */
  readonly start: (head: Uint8Array) => void;
  /** Reports the socket closed without a handshake. */
  readonly abandon: () => void;
  /** Closes the connection with 1001 because the server is stopping. */
  readonly shutdown: () => void;
};

/** An upgrade request whose handler is still running. */
type UpgradeContext = {
  readonly socket: RawSocket;
  /** The open WebSockets of the server that received the request. */
  readonly connections: Set<Connection>;
  /** Set by upgradeWebSocket. */
  accepted: {
    readonly response: Response;
    readonly connection: Connection;
  } | null;
};

/**
 * Computes the Sec-WebSocket-Accept value for a client key (RFC 6455, 4.2.2).
 *
 * @param key - The client's Sec-WebSocket-Key
 * @returns The base64 SHA-1 digest of the key and the handshake GUID
 */
export const computeAcceptKey = (key: string): string =>
  deps.crypto
    .createHash("sha1")
    .update(key + HANDSHAKE_GUID)
    .digest("base64");

/**
 * Serializes a response for a raw socket: the status line, the headers, a
 * content-length for `body`, and `connection: close`.
 *
 * @param response - The response whose status and headers to write
 * @param body - The response body, already read
 * @returns The bytes to write to the socket
 */
export const serializeRawResponse = (
  response: Response,
  body: Uint8Array,
): Uint8Array => {
  const statusText =
    response.statusText !== ""
      ? response.statusText
      : (deps.http.STATUS_CODES[response.status] ?? "");
  const lines = [`HTTP/1.1 ${response.status} ${statusText}`];

  for (const [name, value] of response.headers) {
    if (!FRAMING_HEADERS.has(name)) {
      lines.push(`${name}: ${value}`);
    }
  }

  lines.push(`content-length: ${body.byteLength}`, "connection: close", "", "");

  const head = encoder.encode(lines.join("\r\n"));
  const bytes = new Uint8Array(head.byteLength + body.byteLength);
  bytes.set(head, 0);
  bytes.set(body, head.byteLength);

  return bytes;
};

/**
 * Builds the fetch `Request` for a Node request.
 *
 * @returns The request, or null when its URL or a header cannot be
 *   represented, which the server answers with 400
 */
const toRequest = (
  incoming: deps.http.IncomingMessage,
  fallbackHost: string,
  signal: AbortSignal | null,
): Request | null => {
  const method = incoming.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  try {
    const url = new URL(
      incoming.url ?? "/",
      `http://${incoming.headers.host ?? fallbackHost}`,
    );

    const headers = new Headers();
    const raw = incoming.rawHeaders;
    for (let i = 0; i + 1 < raw.length; i += 2) {
      headers.append(raw[i]!, raw[i + 1]!);
    }

    // A streamed body needs duplex "half", which RequestInit does not type.
    const init: RequestInit & { readonly duplex: "half" } = {
      method,
      headers,
      signal,
      body: hasBody
        ? (deps.stream.Readable.toWeb(incoming) as ReadableStream<Uint8Array>)
        : null,
      duplex: "half",
    };

    return new Request(url, init);
  } catch (error) {
    // URL and Headers throw TypeError for a malformed Host or header value.
    if (error instanceof TypeError) {
      return null;
    }
    throw error;
  }
};

/** Resolves once `response` can take more data or has closed. */
const drainOrClose = (response: deps.http.ServerResponse): Promise<void> =>
  new Promise((resolve) => {
    const done = (): void => {
      response.off("drain", done);
      response.off("close", done);
      resolve();
    };

    response.on("drain", done);
    response.on("close", done);
  });

/** Writes a fetch `Response` to a Node response, streaming its body. */
const writeResponse = async (
  outgoing: deps.http.ServerResponse,
  response: Response,
): Promise<void> => {
  outgoing.statusCode = response.status;
  if (response.statusText !== "") {
    outgoing.statusMessage = response.statusText;
  }

  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") {
      outgoing.setHeader(name, value);
    }
  }

  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    outgoing.setHeader("set-cookie", cookies);
  }

  if (response.body === null) {
    outgoing.end();
    return;
  }

  const reader = response.body.getReader();

  // A client that disconnects cancels the body, which releases what its
  // source holds (an SSE stream stops its timers there).
  const cancel = (): void => {
    reader.cancel().catch(() => {
      // The source's cancel failed while its client is already gone; there
      // is no one left to tell.
    });
  };
  outgoing.once("close", cancel);

  try {
    while (true) {
      // Chunks go out one at a time, in order, at the pace the client reads.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!outgoing.write(value)) {
        // oxlint-disable-next-line no-await-in-loop
        await drainOrClose(outgoing);
      }
    }

    outgoing.end();
  } catch (error) {
    // The body failed after the status line went out. Dropping the connection
    // without the final chunk tells the client the response is incomplete.
    outgoing.destroy();
    shared.reportServeError("a response body failed while streaming.", error);
  } finally {
    outgoing.off("close", cancel);
  }
};

/**
 * Runs a WebSocket over the raw socket of an accepted upgrade.
 *
 * @param raw - The socket Node handed over with the upgrade request
 * @param url - The socket URL
 * @param key - The client's Sec-WebSocket-Key
 * @param onEnded - Called once the connection has ended
 */
const createConnection = (
  raw: RawSocket,
  url: string,
  key: string,
  onEnded: (connection: Connection) => void,
): Connection => {
  const reader = frames.createFrameReader(MAX_MESSAGE_BYTES);
  const assembler = frames.createMessageAssembler(MAX_MESSAGE_BYTES);
  let closeSent = false;
  let closeReceived: frames.CloseInfo | null = null;
  let failed = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const sendClose = (code: number | null, reason: string): void => {
    if (closeSent) {
      return;
    }

    closeSent = true;
    raw.write(frames.encodeClose(code, reason));

    // Once both close frames are out, the server ends the TCP connection
    // (RFC 6455, 7.1.1). Otherwise it waits for the client's, but not forever.
    if (closeReceived !== null) {
      raw.end();
    }
    closeTimer = setTimeout(() => raw.destroy(), CLOSE_TIMEOUT_MS);
  };

  const { socket, events } = serverWebSocket.ServerWebSocket.create(url, {
    send: (data) => {
      if (!closeSent) {
        raw.write(frames.encodeMessage(data));
      }

      return raw.writableLength;
    },
    close: sendClose,
  });

  const onFrame = (frame: frames.Frame): void => {
    switch (frame.opcode) {
      case frames.OPCODES.ping:
        if (!closeSent) {
          raw.write(frames.encodeFrame(frames.OPCODES.pong, frame.payload));
        }
        return;
      case frames.OPCODES.pong:
        return;
      case frames.OPCODES.close: {
        const info = frames.decodeClose(frame.payload);
        closeReceived = info;

        if (closeSent) {
          raw.end();
        } else {
          // Echo the client's code, as RFC 6455 (5.5.1) suggests.
          sendClose(
            info.code === frames.CLOSE_CODES.noStatus ? null : info.code,
            "",
          );
        }
        return;
      }
      default: {
        // Data after the client's close frame is not part of the connection.
        if (closeReceived !== null) {
          return;
        }

        const message = assembler.push(frame);
        if (message !== null) {
          events.received(message);
        }
      }
    }
  };

  const onData = (chunk: Uint8Array): void => {
    if (failed) {
      return;
    }

    try {
      for (const frame of reader.push(chunk)) {
        onFrame(frame);
      }
    } catch (error) {
      if (!(error instanceof frames.WebSocketProtocolError)) {
        throw error;
      }

      failed = true;
      events.failed();
      sendClose(error.code, "");
      raw.end();
    }
  };

  const connection: Connection = {
    socket,
    start: (head) => {
      raw.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${computeAcceptKey(key)}\r\n\r\n`,
      );

      raw.on("data", onData);
      raw.on("drain", () => events.drained());
      // Node's HTTP server lets a client half-close, so the server ends its
      // side itself once the client has ended its own.
      raw.on("end", () => raw.end());
      raw.on("close", () => {
        if (closeTimer !== null) {
          clearTimeout(closeTimer);
        }

        if (failed || closeReceived === null) {
          events.closed(frames.CLOSE_CODES.abnormal, "", false);
        } else {
          events.closed(closeReceived.code, closeReceived.reason, closeSent);
        }

        onEnded(connection);
      });

      events.opened();

      // Frames the client sent right behind its handshake arrive with it.
      if (head.byteLength > 0) {
        onData(head);
      }
    },
    abandon: () => {
      events.closed(frames.CLOSE_CODES.abnormal, "", false);
    },
    shutdown: () => {
      sendClose(frames.CLOSE_CODES.goingAway, "");
      raw.end();
    },
  };

  return connection;
};

/**
 * Creates the Node implementation of `runtime.http`.
 *
 * @returns The HTTP adapter; its upgradeWebSocket accepts only requests that
 *   its own serve passed to a handler
 */
export const createNodeHttp = (): RuntimeHttp => {
  // Upgrade requests whose handler is running, so that upgradeWebSocket can
  // find the raw socket behind the Request it is given.
  const upgrades = new WeakMap<Request, UpgradeContext>();

  const serve = (
    options: ServeOptions,
    handler: HttpHandler,
  ): Promise<HttpServer> =>
    new Promise((resolve, reject) => {
      const respond = shared.createSafeHandler(handler);
      const hostname = options.hostname ?? shared.DEFAULT_SERVE_HOSTNAME;
      const server = deps.http.createServer();
      // Raw sockets of upgrade requests still in their handler, and the
      // WebSockets running over the accepted ones. Both stop with the server.
      const pendingSockets = new Set<RawSocket>();
      const connections = new Set<Connection>();
      // The Host to assume for a request that names none (HTTP/1.0).
      let fallbackHost = hostname;

      const finished = new Promise<void>((resolveFinished) => {
        server.once("close", () => resolveFinished());
      });

      const stop = (): void => {
        server.close();
        server.closeAllConnections();

        for (const socket of pendingSockets) {
          socket.destroy();
        }
        for (const connection of connections) {
          connection.shutdown();
        }
      };

      const handleRequest = async (
        incoming: deps.http.IncomingMessage,
        outgoing: deps.http.ServerResponse,
      ): Promise<void> => {
        const disconnected = new AbortController();
        outgoing.once("close", () => {
          if (!outgoing.writableFinished) {
            disconnected.abort();
          }
        });

        const request = toRequest(incoming, fallbackHost, disconnected.signal);
        if (request === null) {
          outgoing.writeHead(400, { "content-type": "text/plain" });
          outgoing.end("Bad Request: the URL or a header is malformed");
          return;
        }

        await writeResponse(
          outgoing,
          await respond(request, handlerInfo(incoming.socket)),
        );
      };

      const handleUpgrade = async (
        incoming: deps.http.IncomingMessage,
        raw: RawSocket,
        head: Uint8Array,
      ): Promise<void> => {
        const request = toRequest(incoming, fallbackHost, null);
        if (request === null) {
          raw.end(
            serializeRawResponse(
              new Response(null, { status: 400 }),
              new Uint8Array(0),
            ),
          );
          return;
        }

        const context: UpgradeContext = {
          socket: raw,
          connections,
          accepted: null,
        };
        upgrades.set(request, context);
        pendingSockets.add(raw);

        let response: Response;
        try {
          response = await respond(request, handlerInfo(raw));
        } finally {
          upgrades.delete(request);
          pendingSockets.delete(raw);
        }

        const accepted = context.accepted;
        if (accepted !== null && accepted.response === response) {
          if (raw.destroyed) {
            accepted.connection.abandon();
            return;
          }

          connections.add(accepted.connection);
          accepted.connection.start(head);
          return;
        }

        // The handler accepted the handshake but answered with another
        // response, so the socket never opens.
        accepted?.connection.abandon();

        const body = new Uint8Array(await response.arrayBuffer());
        raw.end(serializeRawResponse(response, body));
      };

      server.on("request", (incoming, outgoing) => {
        handleRequest(incoming, outgoing).catch((error: unknown) => {
          outgoing.destroy();
          shared.reportServeError("answering a request failed.", error);
        });
      });

      server.on("upgrade", (incoming, raw: RawSocket, head: Uint8Array) => {
        // A reset connection emits error and then close; the close handlers
        // report it, so the error itself needs no handling here.
        raw.on("error", () => {});

        handleUpgrade(incoming, raw, head).catch((error: unknown) => {
          raw.destroy();
          shared.reportServeError(
            "answering an upgrade request failed.",
            error,
          );
        });
      });

      const onListenError = (error: Error): void => {
        reject(error);
      };
      server.once("error", onListenError);

      server.listen(options.port, hostname, () => {
        server.off("error", onListenError);
        // An error after listening (for example running out of file
        // descriptors) stops the server; `finished` then resolves.
        server.on("error", (error) => {
          shared.reportServeError("the server failed and stopped.", error);
          stop();
        });

        const address = server.address();
        if (address === null || typeof address === "string") {
          stop();
          reject(
            new Error(
              `runtime.http.serve: ${hostname}:${options.port} did not give a TCP address`,
            ),
          );
          return;
        }

        fallbackHost =
          address.family === "IPv6"
            ? `[${address.address}]:${address.port}`
            : `${address.address}:${address.port}`;

        if (options.signal?.aborted === true) {
          stop();
        } else {
          options.signal?.addEventListener("abort", stop, { once: true });
        }

        options.onListen?.({ hostname: address.address, port: address.port });
        resolve({ hostname: address.address, port: address.port, finished });
      });
    });

  const upgradeWebSocket = (request: Request): WebSocketUpgrade => {
    const key = serverWebSocket.readHandshakeKey(request);
    const context = upgrades.get(request);
    if (context === undefined) {
      throw new TypeError(
        "runtime.http.upgradeWebSocket: the request did not come from runtime.http.serve; pass the Request the serve handler received, not a copy, before the handler returns",
      );
    }

    if (context.accepted !== null) {
      throw new TypeError(
        "runtime.http.upgradeWebSocket: the request was already upgraded; call it once per request",
      );
    }

    const connection = createConnection(
      context.socket,
      serverWebSocket.toSocketUrl(request.url),
      key,
      (ended) => context.connections.delete(ended),
    );
    // The fetch Response cannot carry status 101; the server recognizes this
    // object and writes the 101 handshake itself.
    const response = new Response(null);
    context.accepted = { response, connection };

    return { socket: connection.socket, response };
  };

  return { serve, upgradeWebSocket };
};
