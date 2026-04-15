// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts logout [--platform=<platform>]`
 *
 * Clears stored tokens for one or all platforms.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import type { Platform } from "../../../domain/values/platform.ts";
import * as wiring from "../wiring.ts";
import * as output from "../output.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  let platform: Platform | undefined;

  for (const arg of args ?? []) {
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    }
  }

  const { auths, tokenStore } = await wiring.createAppContext();

  const targetPlatforms: Platform[] = platform !== undefined
    ? [platform]
    : Array.from(auths.keys());

  for (const p of targetPlatforms) {
    const auth = auths.get(p);
    if (auth === undefined) {
      await output.outputError(`Platform "${p}" is not configured.`);
      continue;
    }
    auth.clearTokens();
    await tokenStore.clear(p);
    await output.outputSuccess(`Logged out of ${p}`);
  }

  return results.ok(undefined);
};
