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
import { moduleDef } from "./module.ts";
import { exitCli } from "./cli-support.ts";
import config from "./package.json" with { type: "json" };

const app = moduleDef.toCommand("codebase", config.version);

export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  await exitCli(await main());
}
