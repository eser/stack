// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux.js — standalone CLI entry point.
 *
 * Usage:
 *   deno run --allow-all ./main.ts <command> [options]
 *   npx laroux <command> [options]
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as standardsRuntime from "@eser/standards/runtime";
import { moduleDef } from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = moduleDef.toCommand("laroux", config.version);

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
      standardsRuntime.current.process.setExitCode(error.exitCode);
    },
  });
}
