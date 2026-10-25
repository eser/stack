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
import type { AuthProvider } from "../../../application/auth-provider.ts";
import type { TokenStore } from "../../../application/token-store.ts";
import * as wiring from "../wiring.ts";
import * as output from "../output.ts";

const logoutPlatform = async (
  platform: Platform,
  auth: AuthProvider | undefined,
  tokenStore: TokenStore,
): Promise<void> => {
  if (auth === undefined) {
    await output.outputError(`Platform "${platform}" is not configured.`);
    return;
  }
  auth.clearTokens();
  await tokenStore.clear(platform);
  await output.outputSuccess(`Logged out of ${platform}`);
};

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

  const targetPlatforms: Platform[] =
    platform !== undefined ? [platform] : Array.from(auths.keys());

  for (const p of targetPlatforms) {
    // Every platform's tokens live in one token file, so concurrent clears
    // would overwrite each other; one at a time also keeps the output in order.
    // oxlint-disable-next-line no-await-in-loop
    await logoutPlatform(p, auths.get(p), tokenStore);
  }

  return results.ok(undefined);
};
