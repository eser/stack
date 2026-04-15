// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eserstack/codebase — standalone CLI entry point.
 *
 * Usage:
 *   deno run --allow-all jsr:@eserstack/codebase versions
 *   deno run --allow-all ./main.ts release
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import { moduleDef } from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = moduleDef.toCommand("codebase", config.version);

export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        // deno-lint-ignore no-console
        console.error(error.message);
      }
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
