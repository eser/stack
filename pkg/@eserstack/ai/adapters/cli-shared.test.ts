// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as cliShared from "./cli-shared.ts";

// Stopping a CLI through the native library is tested end to end in
// cli-shared.ffi.test.ts; this covers a failure a stand-in CLI cannot produce.

const exitedProcess = (): cliShared.CliProcess => ({
  stdout: new ReadableStream(),
  stderr: new ReadableStream(),
  waitForExit: () => Promise.resolve({ code: 0, success: true }),
  kill: () => {},
});

Deno.test("stopCliProcess resolves when the stderr capture failed", async () => {
  // The capture fails only together with stdout, whose read reports the error.
  const stderrPromise = Promise.reject(new Error("read stderr: handle closed"));

  await cliShared.stopCliProcess(exitedProcess(), stderrPromise);
});
