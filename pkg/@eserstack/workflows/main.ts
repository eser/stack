// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/workflows — standalone CLI entry point.
 *
 * Usage:
 *   deno run --allow-all jsr:@eserstack/workflows run -e precommit
 *   deno run --allow-all ./main.ts list
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import { moduleDef } from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = moduleDef.toCommand("workflows", config.version);

export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  const exitCode = results.match(await main(), {
    ok: () => 0,
    fail: (error) => {
      if (error.message !== undefined) {
        // deno-lint-ignore no-console
        console.error(error.message);
      }
      return error.exitCode;
    },
  });

  // Hard-exit (not setExitCode + natural exit): the workflow engine loads the
  // native @eserstack/ajan FFI lib, which intermittently SIGSEGVs the host on
  // teardown and discards the exit code. Workflow commands (run/list) flush
  // their own output before returning, so nothing is buffered here. This logic
  // is inlined rather than sharing codebase's exitCli — workflows must not
  // depend on codebase (would be circular).
  runtime.process.exit(exitCode);
}
