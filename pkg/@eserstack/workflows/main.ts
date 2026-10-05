// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The standalone CLI of @eserstack/workflows. The package's `.` export runs
 * this CLI, and the library is published at `/mod`:
 *
 * ```typescript
 * import * as workflows from "@eserstack/workflows/mod";
 *
 * const registry = workflows.createRegistry();
 * ```
 *
 * Usage:
 *   deno run --allow-all jsr:@eserstack/workflows run -e precommit
 *   deno run --allow-all ./main.ts list
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as module from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = module.moduleDef.toCommand("workflows", config.version);

/** Parse the process arguments and run the matching workflows command. */
export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  // CLI entry point: the await runs only when this file is the program, never
  // on import.
  // deno-lint-ignore no-top-level-await
  const exitCode = results.match(await main(), {
    ok: () => 0,
    fail: (error) => {
      if (error.message !== undefined) {
        // Not a streams Output: an Output buffers its writes, and the hard
        // exit below would drop whatever it still holds.
        // deno-lint-ignore no-console
        console.error(error.message);
      }
      return error.exitCode;
    },
  });

  // Hard-exit (not setExitCode + natural exit): the shell tool runs commands
  // through the native @eserstack/ajan FFI lib, which intermittently SIGSEGVs
  // the host on teardown and discards the exit code. Workflow commands
  // (run/list) flush their own output before returning, so nothing is buffered
  // here. This logic is inlined rather than shared with codebase's exitCli,
  // because workflows must not depend on codebase (that would be circular).
  runtime.process.exit(exitCode);
}
