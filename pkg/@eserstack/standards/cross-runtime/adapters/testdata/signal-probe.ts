// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Listens for SIGTERM through `runtime.process` on the runtime that runs this
 * file. It prints "ready" once the listener is in place, and on SIGTERM prints
 * "got SIGTERM", removes the listener and lets the process end. The adapter
 * tests send the signal (see probes.ts).
 *
 * @module
 */

import * as crossRuntime from "../../mod.ts";

const encoder = new TextEncoder();

// Nothing else keeps the process alive while it waits for the signal.
const keepAlive = setInterval(() => {}, 1_000);

const onTerminate = (): void => {
  crossRuntime.runtime.process.removeSignalListener("SIGTERM", onTerminate);
  clearInterval(keepAlive);
  crossRuntime.runtime.process.writeToStdout(encoder.encode("got SIGTERM\n"));
};

crossRuntime.runtime.process.addSignalListener("SIGTERM", onTerminate);
crossRuntime.runtime.process.writeToStdout(encoder.encode("ready\n"));
