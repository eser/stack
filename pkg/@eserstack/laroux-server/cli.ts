// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux.js — standalone CLI entry point.
 *
 * Usage:
 *   deno run --allow-all ./cli.ts <command> [options]
 *   npx laroux <command> [options]
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as module from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = module.moduleDef.toCommand("laroux", config.version);

/**
 * Run the `laroux` command line with the process arguments.
 *
 * @returns ok when the command succeeded; otherwise the message to print and
 *   the exit code to set
 */
export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  // CLI entry point: the process runs the command and exits when it settles.
  // deno-lint-ignore no-top-level-await
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        // The failure message is CLI output for the user, written to stderr.
        // deno-lint-ignore no-console
        console.error(error.message);
      }
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
