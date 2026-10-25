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
  const symbols = lib.symbols as unknown as Record<
    string,
    (...args: string[]) => string
  >;

  const created = JSON.parse(
    symbols["EserAjanLogCreate"]!(
      JSON.stringify({ scopeName: "node-wasm", level: "INFO" }),
    ),
  ) as { handle: string };

  const writes = [1, 2, 3].map((n) =>
    symbols["EserAjanLogWrite"]!(
      JSON.stringify({
        handle: created.handle,
        level: "INFO",
        message: `write ${n}`,
      }),
    )
  );
  const filtered = symbols["EserAjanLogWrite"]!(
    JSON.stringify({ handle: created.handle, level: "DEBUG", message: "drop" }),
  );
  const closed = symbols["EserAjanLogClose"]!(created.handle);

  // A name outside the profile throws UnsupportedInWasmError only on the
  // reactor, so this tells which build answered.
  let reactor = false;
  try {
    symbols["EserAjanShellExec"]!("{}");
  } catch (error) {
    reactor = (error as { code?: string }).code === "UNSUPPORTED_IN_WASM";
  }
  const afterClose = symbols["EserAjanLogWrite"]!(
    JSON.stringify({ handle: created.handle, level: "INFO", message: "late" }),
  );

  // deno-lint-ignore no-console
  console.log(
    JSON.stringify({
      reactor,
      handle: created.handle,
      writes,
      filtered,
      closed,
      afterClose,
    }),
  );
  lib.close();
};

main().catch((error: unknown) => {
  // deno-lint-ignore no-console
  console.error(error);
  throw error;
});
