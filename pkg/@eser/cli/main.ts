// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * eser - Versatile development CLI
 *
 * A multi-purpose command-line tool for development workflows.
 * Similar in design to `gh` (GitHub CLI) or `wrangler` (Cloudflare).
 *
 * Usage:
 *   deno run -A ./main.ts <command> [subcommand] [options]
 *   dx jsr:@eser/cli <command> [subcommand] [options]
 *
 * Commands:
 *   codebase    Codebase validation and management tools
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as standardsRuntime from "@eser/standards/runtime";
import { codebaseCommand } from "./commands/codebase/mod.ts";
import config from "./deno.json" with { type: "json" };

type CommandHandler = (
  args: string[],
  flags: Record<string, unknown>,
) => Promise<void>;

const commands: Record<string, CommandHandler> = {
  codebase: codebaseCommand,
};

const showHelp = (): void => {
  console.log("eser - Versatile development CLI\n");
  console.log("Usage: eser <command> [subcommand] [options]\n");
  console.log("Commands:");
  console.log("  codebase    Codebase validation and management tools");
  console.log("\nOptions:");
  console.log("  -h, --help     Show this help message");
  console.log("  -v, --version  Show version number");
  console.log("\nRun 'eser <command> --help' for command-specific help.");
};

export const main = async (): Promise<void> => {
  // @ts-ignore parseArgs doesn't mutate the array, readonly is safe
  const args = cliParseArgs.parseArgs(standardsRuntime.runtime.process.args, {
    boolean: ["help", "version"],
    alias: { h: "help", v: "version" },
    stopEarly: true, // Stop parsing at first non-option to pass rest to subcommand
  });

  if (args.version) {
    console.log(`eser ${config.version}`);
    return;
  }

  const command = args._[0] as string | undefined;

  // Show main help only if no command or help without command
  if (command === undefined) {
    showHelp();
    return;
  }

  const handler = commands[command];
  if (handler === undefined) {
    console.error(`Unknown command: ${command}`);
    console.log("");
    showHelp();
    standardsRuntime.runtime.process.exit(1);
  }

  // Pass remaining args to command handler
  await handler(args._.slice(1) as string[], args);
};

if (import.meta.main) {
  await main();
}
