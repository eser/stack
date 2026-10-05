// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Sub-dispatcher for GitHub operations.
 *
 * Routes `eser codebase gh <subcommand>` to the correct handler module.
 *
 * CLI usage:
 *   eser codebase gh contributors   — Update contributor list in README.md
 *   eser codebase gh release-notes  — Sync CHANGELOG to GitHub Releases
 *   eser codebase gh release-tag    — Create and push release git tags
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import * as standards from "@eserstack/standards";
import type * as shellArgs from "@eserstack/shell/args";
import * as tui from "@eserstack/shell/tui";
import * as cliSupport from "./cli-support.ts";

const showGhHelp = (): void => {
  const { ctx, output: out } = cliSupport.getCliContext();
  tui.log.info(ctx, "eser codebase gh — GitHub operations\n");
  out.writeln("Subcommands:");
  out.writeln("  contributors     Update contributor list in README.md");
  out.writeln("  release-notes    Sync CHANGELOG to GitHub Releases");
  out.writeln("  release-tag      Create and push release git tags");
  out.writeln(
    "\nRun 'eser codebase gh <subcommand> --help' for details.",
  );
};

/** CLI entry point for dispatcher compatibility. */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const args = (cliArgs ?? []) as string[];
  const subcommand = args[0];
  const remaining = args.slice(1);

  if (
    subcommand === undefined || subcommand === "--help" ||
    subcommand === "-h"
  ) {
    showGhHelp();
    return primitives.results.ok(undefined);
  }

  switch (subcommand) {
    case "contributors": {
      const mod = await import("./gh-contributors.ts");
      return await mod.main(remaining);
    }
    case "release-notes": {
      const mod = await import("./release-notes.ts");
      return await mod.main(remaining);
    }
    case "release-tag": {
      const mod = await import("./release-tag.ts");
      return await mod.main(remaining);
    }
    default: {
      const { ctx } = cliSupport.getCliContext();
      tui.log.error(ctx, `Unknown gh subcommand: ${subcommand}`);
      showGhHelp();
      return primitives.results.fail({ exitCode: 1 });
    }
  }
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // deno-lint-ignore no-top-level-await
  const result = await main(
    standards.crossRuntime.runtime.process.args as string[],
  );
  cliSupport.runCliMain(result, cliSupport.getCliContext().output);
}
