// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The standalone CLI of @eserstack/codebase. The package's `.` export runs this
 * CLI, and the library is published at `/mod`:
 *
 * ```typescript
 * import * as codebase from "@eserstack/codebase/mod";
 *
 * const packages = await codebase.discoverPackages(".");
 * ```
 *
 * Usage:
 *   npx eser codebase versions
 *   node ./main.ts release
 *
 * @module
 */

import type * as results from "@eserstack/primitives/results";
import * as module from "./module.ts";
import * as cliSupport from "./cli-support.ts";
import config from "./package.json" with { type: "json" };

const app = module.moduleDef.toCommand("codebase", config.version);

/** Parse the process arguments and run the matching codebase command. */
export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  await cliSupport.exitCli(await main());
}
