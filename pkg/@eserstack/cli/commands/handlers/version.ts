// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Version command handler - displays CLI version and checks for updates.
 *
 * When invoked with --bare, prints only the raw version string (no extras).
 * This is relied upon by Homebrew's test block.
 *
 * @module
 */

import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as results from "@eserstack/primitives/results";
import * as shellArgs from "@eserstack/shell/args";
import * as versionCheck from "./version-check.ts";
import config from "../../package.json" with { type: "json" };

const UPDATE_CHECK_TIMEOUT_MS = 200;

export const versionHandler = async (
  ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  // --bare: print raw version only (Homebrew compatibility)
  if (ctx.flags["bare"] === true) {
    out.writeln(span.text(config.version));
    await out.close();
    return results.ok(undefined);
  }

  out.writeln(span.text(`eser ${config.version}`));

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
      out.writeln(
        span.dim(
          `  Update available: v${result.latestVersion} — run 'eser update'`,
        ),
      );
    }
  } catch {
    // Silently ignore — update check is best-effort
  }

  await out.close();
  return results.ok(undefined);
};
