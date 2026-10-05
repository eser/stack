// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The standalone CLI of @eserstack/kit. The package's `.` export runs this CLI,
 * and the library is published at `/mod`:
 *
 * ```typescript
 * import * as kit from "@eserstack/kit/mod";
 *
 * const command = kit.moduleDef.toCommand("kit", "1.0.0");
 * ```
 *
 * Usage:
 *   deno run --allow-all jsr:@eserstack/kit add recipe-name
 *   deno run --allow-all ./main.ts new my-project
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as module from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = module.moduleDef.toCommand("kit", config.version);

/**
 * Runs the kit CLI on the process arguments. Resolves to a failure that
 * carries the message to print and the exit code when a command fails.
 */
export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // deno-lint-ignore no-top-level-await
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        // The CLI reports a failed command to the user on stderr.
        // deno-lint-ignore no-console
        console.error(error.message);
      }
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
