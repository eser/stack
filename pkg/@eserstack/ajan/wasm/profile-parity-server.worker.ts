// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The HTTP server of profile-parity.test.ts, on its own thread: a native
 * bridge call blocks the test's thread until it returns, so a server there
 * could never answer it. Posts its port once it listens, and closes on any
 * message.
 *
 * @module
 */

import * as http from "node:http";
import type * as net from "node:net";
import * as workerThreads from "node:worker_threads";

const parentPort = workerThreads.parentPort;
if (parentPort === null) {
  throw new Error("profile-parity-server.worker.ts must run as a worker");
}

const readBody = async (request: http.IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
};

/**
 * Answers with a fixed length, as a Response with a string body does: Go's
 * client folds a chunked Transfer-Encoding into the response and drops the
 * header, while fetch on the reactor's side reports it, so a chunked answer
 * would differ in its headers alone.
 */
const send = (
  response: http.ServerResponse,
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): void => {
  response.writeHead(status, {
    "content-type": "text/plain;charset=UTF-8",
    "content-length": String(Buffer.byteLength(body)),
    ...headers,
  });
  response.end(body);
};

const server = http.createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (path === "/echo") {
    send(response, 200, `echo:${await readBody(request)}`, {
      "x-parity": "yes",
    });
    return;
  }
  if (path === "/stream") {
    send(response, 200, "streamed body");
    return;
  }
  send(response, 404, "nope");
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address() as net.AddressInfo;
  parentPort.postMessage({ port });
});

parentPort.on("message", () => {
  server.closeAllConnections();
  server.close(() => parentPort.close());
});
