// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Run by node-reactor-log.test.ts under `node --no-experimental-ffi`: loads
 * the bridge through the public loader, which falls back to the WASM reactor,
 * and runs a logger's whole life on that one instance. It prints one JSON
 * line with what it saw. It runs under plain Node from the source tree, so it
 * imports only relative modules and writes with console.log.
 *
 * @module
 */

import * as ffi from "../ffi/mod.ts";

const main = async (): Promise<void> => {
  const lib = await ffi.loadEserAjan();
  const text = (answer: unknown): string => JSON.stringify(answer);

  const created = lib.call("logCreate", {
    scopeName: "node-wasm",
    level: "INFO",
  });
  const handle = created.handle ?? "";

  const writes = [1, 2, 3].map((n) =>
    text(
      lib.call("logWrite", { handle, level: "INFO", message: `write ${n}` }),
    ),
  );
  const filtered = text(
    lib.call("logWrite", { handle, level: "DEBUG", message: "drop" }),
  );
  const closed = text(lib.call("logClose", handle));

  // A name outside the profile throws UnsupportedInWasmError only on the
  // reactor, so this tells which build answered.
  let reactor = false;
  try {
    lib.call("shellExec", { command: "true" });
  } catch (error) {
    reactor = (error as { code?: string }).code === "UNSUPPORTED_IN_WASM";
  }
  const afterClose = text(
    lib.call("logWrite", { handle, level: "INFO", message: "late" }),
  );

  // oxlint-disable-next-line no-console
  console.log(
    JSON.stringify({
      reactor,
      handle,
      writes,
      filtered,
      closed,
      afterClose,
    }),
  );
  lib.close();
};

main().catch((error: unknown) => {
  // oxlint-disable-next-line no-console
  console.error(error);
  throw error;
});
