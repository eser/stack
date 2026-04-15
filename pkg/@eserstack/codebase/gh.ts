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
import { createCliContext, runCliMain } from "./cli-support.ts";

const { ctx, output: out } = createCliContext();

const showGhHelp = (): void => {
  tui.log.info(ctx, "eser codebase gh — GitHub operations\n");
  console.log("Subcommands:");
  console.log("  contributors     Update contributor list in README.md");
  console.log("  release-notes    Sync CHANGELOG to GitHub Releases");
  console.log("  release-tag      Create and push release git tags");
  console.log(
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
    default:
      tui.log.error(ctx, `Unknown gh subcommand: ${subcommand}`);
      showGhHelp();
      return primitives.results.fail({ exitCode: 1 });
  }
};

if (import.meta.main) {
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
    out,
  );
}
