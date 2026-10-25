// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The server end of a WebSocket, for the Node adapter.
 *
 * Node has no WebSocket server, so the adapter drives a
 * {@link ServerWebSocket} instead: the adapter writes frames
 * through a {@link WebSocketWire} and reports what happens on the connection
 * through {@link WebSocketEvents}.
 *
 * @module
 */

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** The longest close reason a close frame can carry, in UTF-8 bytes. */
const MAX_CLOSE_REASON_BYTES = 123;

const encoder = new TextEncoder();

/**
 * Puts a {@link ServerWebSocket}'s messages on the connection. The adapter
 * implements it.
 */
export type WebSocketWire = {
  /**
   * Sends one message. Called only while the socket is open.
   *
   * @returns The bytes queued for sending and not yet written to the network
   */
  readonly send: (data: string | Uint8Array) => number;
  /**
   * Starts the closing handshake; called at most once.
   *
   * @param code - The status code for the close frame, or null for none
   * @param reason - The close reason; empty when there is none
   */
  readonly close: (code: number | null, reason: string) => void;
};

/**
 * What the adapter reports to a {@link ServerWebSocket} as its connection
 * changes.
 */
export type WebSocketEvents = {
  /** The handshake completed and messages can flow. */
  readonly opened: () => void;
  /** A complete message arrived. */
  readonly received: (data: string | Uint8Array) => void;
  /** The send buffer was written out to the network. */
  readonly drained: () => void;
  /** The connection failed, for example on a protocol error; closed follows. */
  readonly failed: () => void;
  /**
   * The connection ended.
   *
   * @param code - The status code of the close frame, 1005 when it had none,
   *   1006 when the connection ended without one
   * @param reason - The close reason
   * @param wasClean - True when both ends exchanged close frames
   */
  readonly closed: (code: number, reason: string, wasClean: boolean) => void;
};

/**
 * A `WebSocket` for the server end of a connection, driven by a runtime
 * adapter through a wire and an events object.
 */
export class ServerWebSocket extends EventTarget implements WebSocket {
  /** The value of readyState while the handshake is in progress. */
  readonly CONNECTING: 0 = CONNECTING;
  /** The value of readyState while messages can flow. */
  readonly OPEN: 1 = OPEN;
  /** The value of readyState while the closing handshake is in progress. */
  readonly CLOSING: 2 = CLOSING;
  /** The value of readyState once the connection has ended. */
  readonly CLOSED: 3 = CLOSED;

  /**
   * How binary messages are delivered: as an ArrayBuffer (the default) or as
   * a Blob.
   */
  binaryType: BinaryType = "arraybuffer";
  /** Bytes queued for sending, as of the last send or drain. */
  bufferedAmount = 0;
  /** Always empty: the server negotiates no extension. */
  readonly extensions = "";
  /** Always empty: the server selects no subprotocol. */
  readonly protocol = "";
  /** CONNECTING, OPEN, CLOSING or CLOSED; the adapter's events update it. */
  readyState: 0 | 1 | 2 | 3 = CONNECTING;
  /** The URL of the handshake request, with a ws: or wss: scheme. */
  readonly url: string;

  /** Called for the close event, after the listeners added before it. */
  onclose: ((this: WebSocket, event: CloseEvent) => unknown) | null = null;
  /** Called for the error event, after the listeners added before it. */
  onerror: ((this: WebSocket, event: Event) => unknown) | null = null;
  /** Called for each message event, after the listeners added before it. */
  onmessage: ((this: WebSocket, event: MessageEvent) => unknown) | null = null;
  /** Called for the open event, after the listeners added before it. */
  onopen: ((this: WebSocket, event: Event) => unknown) | null = null;

  readonly #wire: WebSocketWire;
  /** The last send that waits behind a Blob still being read, if any. */
  #pending: Promise<void> | null = null;
  #closeRequest: { readonly code: number | null; readonly reason: string } = {
    code: null,
    reason: "",
  };

  /**
   * Creates a socket and the events object its adapter drives it with.
   *
   * @param url - The URL of the handshake request
   * @param wire - Sends the socket's messages and close frame
   * @returns The socket, in the CONNECTING state, and its events object
   */
  static create(
    url: string,
    wire: WebSocketWire,
  ): { readonly socket: ServerWebSocket; readonly events: WebSocketEvents } {
    const socket = new ServerWebSocket(url, wire);

    return {
      socket,
      events: {
        opened: () => socket.#opened(),
        received: (data) => socket.#received(data),
        drained: () => {
          socket.bufferedAmount = 0;
        },
        failed: () => socket.#failed(),
        closed: (code, reason, wasClean) =>
          socket.#closed(code, reason, wasClean),
      },
    };
  }

  private constructor(url: string, wire: WebSocketWire) {
    super();
    this.url = url;
    this.#wire = wire;

    // The on* handlers are listeners added first, the way a browser runs them,
    // so an exception in one is reported like one in any other listener.
    this.addEventListener("open", (event) => this.onopen?.call(this, event));
    this.addEventListener("error", (event) => this.onerror?.call(this, event));
    this.addEventListener("message", (event) => {
      if (event instanceof MessageEvent) {
        this.onmessage?.call(this, event);
      }
    });
    this.addEventListener("close", (event) => {
      if (event instanceof CloseEvent) {
        this.onclose?.call(this, event);
      }
    });
  }

  /**
   * Sends a message: a string as text, bytes or a Blob as binary.
   *
   * @param data - The message
   * @throws {DOMException} InvalidStateError while the socket is connecting
   */
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState === CONNECTING) {
      throw new DOMException(
        "WebSocket send: the socket is still connecting; send after its open event",
        "InvalidStateError",
      );
    }

    // Like a browser socket, a closing or closed socket drops the message.
    if (this.readyState !== OPEN) {
      return;
    }

    if (this.#pending === null && !(data instanceof Blob)) {
      this.bufferedAmount = this.#wire.send(toWireData(data));
      return;
    }

    // A Blob is read asynchronously, so it and every message sent after it
    // wait their turn, which keeps the messages in the order they were sent.
    const pending = (this.#pending ?? Promise.resolve()).then(async () => {
      const payload =
        data instanceof Blob
          ? new Uint8Array(await data.arrayBuffer())
          : toWireData(data);

      if (this.readyState === OPEN) {
        this.bufferedAmount = this.#wire.send(payload);
      }
    });
    this.#pending = pending;

    pending.then(
      () => {
        if (this.#pending === pending) {
          this.#pending = null;
        }
      },
      () => {
        if (this.#pending === pending) {
          this.#pending = null;
        }

        // A Blob that cannot be read would leave a gap in the messages, so
        // the connection ends with 1011 (internal error).
        if (this.readyState === OPEN) {
          this.readyState = CLOSING;
          this.dispatchEvent(new Event("error"));
          this.#wire.close(1011, "");
        }
      },
    );
  }

  /**
   * Starts the closing handshake. The close event follows once the connection
   * has ended.
   *
   * @param code - 1000, or an application code from 3000 to 4999
   * @param reason - Up to 123 bytes of UTF-8
   * @throws {DOMException} InvalidAccessError for another code, SyntaxError
   * for a longer reason
   */
  close(code?: number, reason?: string): void {
    if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999)) {
      throw new DOMException(
        `WebSocket close: code ${code} is reserved; use 1000 or a code from 3000 to 4999`,
        "InvalidAccessError",
      );
    }

    const closeReason = reason ?? "";
    if (encoder.encode(closeReason).byteLength > MAX_CLOSE_REASON_BYTES) {
      throw new DOMException(
        `WebSocket close: the reason is longer than ${MAX_CLOSE_REASON_BYTES} bytes of UTF-8`,
        "SyntaxError",
      );
    }

    if (this.readyState === CLOSING || this.readyState === CLOSED) {
      return;
    }

    const wasConnecting = this.readyState === CONNECTING;
    this.readyState = CLOSING;
    this.#closeRequest = { code: code ?? null, reason: closeReason };

    // A socket closed while connecting sends its close frame once the
    // handshake completes (see #opened).
    if (!wasConnecting) {
      this.#wire.close(this.#closeRequest.code, this.#closeRequest.reason);
    }
  }

  #opened(): void {
    if (this.readyState === CLOSING) {
      this.#wire.close(this.#closeRequest.code, this.#closeRequest.reason);
      return;
    }

    if (this.readyState !== CONNECTING) {
      return;
    }

    this.readyState = OPEN;
    this.dispatchEvent(new Event("open"));
  }

  #received(data: string | Uint8Array): void {
    // A message that arrives after close() is dropped, as in a browser.
    if (this.readyState !== OPEN) {
      return;
    }

    this.dispatchEvent(
      new MessageEvent("message", { data: this.#toMessageData(data) }),
    );
  }

  #failed(): void {
    if (this.readyState === CLOSED) {
      return;
    }

    this.dispatchEvent(new Event("error"));
  }

  #closed(code: number, reason: string, wasClean: boolean): void {
    if (this.readyState === CLOSED) {
      return;
    }

    this.readyState = CLOSED;
    this.dispatchEvent(new CloseEvent("close", { code, reason, wasClean }));
  }

  #toMessageData(data: string | Uint8Array): string | ArrayBuffer | Blob {
    if (typeof data === "string") {
      return data;
    }

    // The copy also detaches the message from the adapter's read buffer.
    const bytes = new Uint8Array(data);

    return this.binaryType === "arraybuffer" ? bytes.buffer : new Blob([bytes]);
  }
}

/** Converts the bytes a caller passes to send() to the wire's Uint8Array. */
const toWireData = (
  data: string | ArrayBufferLike | ArrayBufferView,
): string | Uint8Array => {
  if (typeof data === "string") {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return new Uint8Array(data);
};

/**
 * Checks that `request` opens a WebSocket (RFC 6455, section 4.2.1) and
 * returns its Sec-WebSocket-Key.
 *
 * @param request - The request a serve handler received
 * @returns The client's handshake key
 * @throws {TypeError} Naming the header that does not fit a handshake
 */
export const readHandshakeKey = (request: Request): string => {
  const fail = (problem: string): never => {
    throw new TypeError(
      `runtime.http.upgradeWebSocket: ${problem}; a WebSocket handshake is a GET request with "Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Version: 13" and a Sec-WebSocket-Key`,
    );
  };

  if (request.method !== "GET") {
    fail(`the request method is ${request.method}`);
  }

  if (!hasToken(request.headers.get("upgrade"), "websocket")) {
    fail(`the Upgrade header is "${request.headers.get("upgrade") ?? ""}"`);
  }

  if (!hasToken(request.headers.get("connection"), "upgrade")) {
    fail(
      `the Connection header is "${request.headers.get("connection") ?? ""}"`,
    );
  }

  const version = request.headers.get("sec-websocket-version");
  if (version !== "13") {
    fail(`the Sec-WebSocket-Version header is "${version ?? ""}"`);
  }

  // The key is 16 random bytes in base64: 22 characters and "==".
  const key = request.headers.get("sec-websocket-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9+/]{22}==$/.test(key)) {
    fail(`the Sec-WebSocket-Key header "${key}" is not 16 bytes in base64`);
  }

  return key;
};

/** Reports whether a comma-separated header value lists `token`. */
const hasToken = (value: string | null, token: string): boolean =>
  value !== null &&
  value.split(",").some((part) => part.trim().toLowerCase() === token);

/**
 * The URL a server socket reports for a handshake request: the request URL
 * with its http: or https: scheme changed to ws: or wss:.
 *
 * @param requestUrl - The URL of the handshake request
 * @returns The socket URL
 */
export const toSocketUrl = (requestUrl: string): string => {
  const url = new URL(requestUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.href;
};
