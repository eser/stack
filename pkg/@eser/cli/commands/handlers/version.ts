// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Version command handler - displays CLI version and checks for updates.
 *
 * When invoked with --bare, prints only the raw version string (no extras).
 * This is relied upon by Homebrew's test block.
 *
 * @module
 */

import * as fmtColors from "@eser/shell/formatting/colors";
import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as versionCheck from "./version-check.ts";
import config from "../../package.json" with { type: "json" };

const UPDATE_CHECK_TIMEOUT_MS = 200;

export const versionHandler = async (
  ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  // --bare: print raw version only (Homebrew compatibility)
  if (ctx.flags["bare"] === true) {
    // deno-lint-ignore no-console
    console.log(config.version);
    return results.ok(undefined);
  }

  // deno-lint-ignore no-console
  console.log(`eser ${config.version}`);

  // Race the update check against a short timeout so the command stays snappy
  try {
    const timeoutPromise = new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), UPDATE_CHECK_TIMEOUT_MS);
    });

    const result = await Promise.race([
      versionCheck.checkForUpdate(),
      timeoutPromise,
    ]);

    if (result !== undefined && result.updateAvailable) {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.dim(
          `  Update available: v${result.latestVersion} — run 'eser update'`,
        ),
      );
    }
  } catch {
    // Silently ignore — update check is best-effort
  }

  return results.ok(undefined);
};
