// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * One run through the `runtime.http` contract: plain, streamed and failing
 * requests, a refused and an accepted WebSocket handshake, and a server stop
 * with a socket still open. Every adapter must observe
 * {@link EXPECTED_HTTP_RESULT}.
 *
 * @module
 */

import type { RuntimeHttp } from "../../types.ts";

const encoder = new TextEncoder();

/** How long one probe step may take before the probe fails. */
const STEP_TIMEOUT_MS = 5_000;

/** Resolves with `promise`, or rejects once it has taken too long. */
const withTimeout = async <T>(
  promise: Promise<T>,
  step: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${step} took over ${STEP_TIMEOUT_MS} ms`)),
      STEP_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timer);
  }
};

/** What a client socket saw before it closed. */
type SocketObservation = {
  readonly opened: boolean;
  readonly messages: readonly string[];
  readonly closeCode: number;
  readonly closeReason: string;
};

/**
 * Opens a client socket and resolves once it has closed. `onOpen` runs once
 * it is open, and `onMessage` with the count of messages so far.
 */
const watchSocket = (
  url: string,
  onOpen: (socket: WebSocket) => void,
  onMessage: (socket: WebSocket, count: number) => void,
): Promise<SocketObservation> =>
  new Promise((resolve) => {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    let opened = false;
    const messages: string[] = [];

    socket.onopen = () => {
      opened = true;
      onOpen(socket);
    };
    socket.onmessage = (event) => {
      messages.push(
        typeof event.data === "string"
          ? `text:${event.data.length}:${event.data.slice(0, 8)}`
          : `binary:${new Uint8Array(event.data).join(",")}`,
      );
      onMessage(socket, messages.length);
    };
    // A refused handshake reports an error, then the close below.
    socket.onerror = () => {};
    socket.onclose = (event) =>
      resolve({
        opened,
        messages,
        closeCode: event.code,
        closeReason: event.reason,
      });
  });

const handle = async (
  http: RuntimeHttp,
  request: Request,
  serverEvents: string[],
): Promise<Response> => {
  const url = new URL(request.url);

  switch (url.pathname) {
    case "/echo":
      return new Response(`${request.method} ${await request.text()}`, {
        headers: [["set-cookie", "a=1"], ["set-cookie", "b=2"]],
      });
    case "/stream": {
      const chunks = ["one ", "two ", "three"];
      return new Response(
        new ReadableStream({
          pull(stream) {
            const chunk = chunks.shift();
            if (chunk === undefined) {
              stream.close();
            } else {
              stream.enqueue(encoder.encode(chunk));
            }
          },
        }),
      );
    }
    case "/throws":
      throw new Error("the probe handler fails on purpose");
    case "/not-upgradable":
      try {
        http.upgradeWebSocket(request);
        return new Response("upgraded");
      } catch (error) {
        return new Response(
          error instanceof TypeError ? "TypeError" : "other",
          {
            status: 400,
          },
        );
      }
    case "/forbidden":
      return new Response("forbidden", { status: 403 });
    case "/socket": {
      const { socket, response } = http.upgradeWebSocket(request);
      socket.addEventListener("open", () => serverEvents.push("open"));
      socket.addEventListener("message", (event) => {
        serverEvents.push(`message:${typeof event.data}`);
        if (event.data === "close-me") {
          socket.close(4000, "asked");
        } else {
          socket.send(event.data);
        }
      });
      socket.addEventListener("close", () => serverEvents.push("close"));
      return response;
    }
    default:
      return new Response(`${request.method} ${url.pathname}${url.search}`);
  }
};

/**
 * Serves on a free port with `http`, talks to the server, stops it, and
 * returns what the client and the server saw.
 *
 * @param http - The adapter under test
 * @returns The observations, to compare with {@link EXPECTED_HTTP_RESULT}
 */
export const exerciseHttp = async (
  http: RuntimeHttp,
): Promise<Record<string, unknown>> => {
  const controller = new AbortController();
  const serverEvents: string[] = [];
  let listenedPort: number | null = null;
  let peer: unknown = null;

  const server = await http.serve(
    {
      port: 0,
      signal: controller.signal,
      onListen: (addr) => {
        listenedPort = addr.port;
      },
    },
    (request, info) => {
      if (new URL(request.url).pathname === "/hello") {
        // The client connects from this machine, on a port the system picks.
        peer = info.remoteAddr === null
          ? null
          : [info.remoteAddr.hostname, info.remoteAddr.port > 0];
      }

      return handle(http, request, serverEvents);
    },
  );
  const listenedBeforeResolve = listenedPort === server.port;

  const base = `http://127.0.0.1:${server.port}`;
  const socketBase = `ws://127.0.0.1:${server.port}`;

  const get = await fetch(`${base}/hello?name=probe`);
  const post = await fetch(`${base}/echo`, { method: "POST", body: "posted" });
  const stream = await fetch(`${base}/stream`);
  const throws = await fetch(`${base}/throws`);
  const notUpgradable = await fetch(`${base}/not-upgradable`);

  const forbidden = await withTimeout(
    watchSocket(`${socketBase}/forbidden`, () => {}, () => {}),
    "the refused handshake",
  );

  const echo = await withTimeout(
    watchSocket(
      `${socketBase}/socket`,
      (socket) => {
        socket.send("hello");
        socket.send(new Uint8Array([1, 2, 3]));
        socket.send("x".repeat(70_000));
      },
      (socket, count) => {
        if (count === 3) {
          socket.send("close-me");
        }
      },
    ),
    "the echo socket",
  );

  // Stopping the server ends a socket that is still open.
  let opened: () => void = () => {};
  const open = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const lingering = watchSocket(
    `${socketBase}/socket`,
    () => opened(),
    () => {},
  );
  await withTimeout(open, "opening a socket");

  controller.abort();
  await withTimeout(server.finished, "stopping the server");
  const lingeringClosed = await withTimeout(
    lingering.then(() => true),
    "closing the open socket",
  );

  const refusedAfterStop = await fetch(base).then(
    async (response) => {
      await response.body?.cancel();
      return false;
    },
    () => true,
  );

  return {
    hostname: server.hostname,
    listenedBeforeResolve,
    peer,
    get: [get.status, await get.text()],
    post: [post.status, await post.text(), post.headers.getSetCookie()],
    stream: await stream.text(),
    throws: [throws.status, await throws.text()],
    notUpgradable: [notUpgradable.status, await notUpgradable.text()],
    forbiddenOpened: forbidden.opened,
    echo,
    serverEvents,
    lingeringClosed,
    refusedAfterStop,
  };
};

/** What {@link exerciseHttp} returns on every runtime. */
export const EXPECTED_HTTP_RESULT: Record<string, unknown> = {
  hostname: "127.0.0.1",
  listenedBeforeResolve: true,
  peer: ["127.0.0.1", true],
  get: [200, "GET /hello?name=probe"],
  post: [200, "POST posted", ["a=1", "b=2"]],
  stream: "one two three",
  throws: [500, "Internal Server Error"],
  notUpgradable: [400, "TypeError"],
  forbiddenOpened: false,
  echo: {
    opened: true,
    messages: ["text:5:hello", "binary:1,2,3", "text:70000:xxxxxxxx"],
    closeCode: 4000,
    closeReason: "asked",
  },
  serverEvents: [
    "open",
    "message:string",
    "message:object",
    "message:string",
    "message:string",
    "close",
    "open",
    "close",
  ],
  lingeringClosed: true,
  refusedAfterStop: true,
};
