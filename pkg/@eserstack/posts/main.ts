#!/usr/bin/env -S node
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The standalone CLI of @eserstack/posts, the `eser-posts` bin. Its command
 * tree is the module the `eser` CLI mounts at `eser posts`, so
 * `eser-posts compose` and `eser posts compose` run the same code.
 *
 * Usage:
 *   node ./main.ts <command> [options]
 *   npx -p @eserstack/posts eser-posts <command> [options]
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as module from "./module.ts";
import config from "./package.json" with { type: "json" };

const app = module.moduleDef.toCommand("eser-posts", config.version);

/** Parse the process arguments and run the matching posts command. */
export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        // The CLI reports a failed command to the user on stderr.
        // oxlint-disable-next-line no-console
        console.error(error.message);
      }
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
