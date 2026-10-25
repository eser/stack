// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The standalone CLI of @eserstack/ai. The package's `.` export runs this CLI,
 * and the library is published at `/mod`:
 *
 * ```typescript
 * import * as ai from "@eserstack/ai/mod";
 *
 * const providers = await ai.getAvailableProviderNames();
 * ```
 *
 * Usage:
 *   deno run --allow-all jsr:@eserstack/ai ask "your prompt" [-p provider]
 *   deno run --allow-all ./main.ts ask "your prompt" [-p cc]
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as module from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = module.moduleDef.toCommand("ai", config.version);

/** Parse the process arguments and run the matching ai command. */
export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  // CLI entry point: the await runs only when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        // The CLI reports a failed command on stderr before it sets the code.
        // oxlint-disable-next-line no-console
        console.error(error.message);
      }
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
