// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// The JSON line printed here is this probe's result, which the parent test
// reads from stdout.
// deno-lint-ignore-file no-console

/**
 * Runs `startServer` the way `noskills web` does: no logger option and no
 * logging configuration. It sends one action that faults, prints the status
 * and body of the response as the last line of stdout, and stops the server.
 * server-log.test.ts finds the fault's log record in this process's stderr.
 *
 * Expects the access token in `NOSKILLS_WEB_TOKEN`.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as server from "../server.ts";

const main = async (): Promise<void> => {
  const token = runtime.env.get("NOSKILLS_WEB_TOKEN");
  if (token === undefined) {
    throw new Error("log-probe needs NOSKILLS_WEB_TOKEN; the test sets it");
  }

  // An empty project root: every spec action fails there with a caught fault.
  const root = await runtime.fs.makeTempDir();
  const controller = new AbortController();
  const listening = Promise.withResolvers<number>();

  const stopped = server.startServer({
    root,
    port: 0,
    signal: controller.signal,
    onListen: (address) => listening.resolve(address.port),
  });
  // A server that cannot bind rejects before it listens.
  stopped.catch((error: unknown) => listening.reject(error));

  try {
    const port = await listening.promise;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/spec/no-such-spec/approve`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-noskills-token": token,
        },
        body: "{}",
      },
    );
    const body: unknown = await response.json();

    console.log(JSON.stringify({ status: response.status, body }));
  } finally {
    controller.abort();
    await stopped;
    await runtime.fs.remove(root, { recursive: true });
  }
};

// A probe script: the awaited call is the whole program.
// deno-lint-ignore no-top-level-await
await main();
