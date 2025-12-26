// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * eser - Eser Ozvataf's command-line tooling to access things
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
 *   system      System management and setup tools
 *   install     Install eser CLI globally (alias for system install)
 *   update      Update eser CLI to latest version (alias for system update)
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as standardsRuntime from "@eser/standards/runtime";
import {
  Command,
  type CommandContext,
  type CommandLike,
} from "@eser/shell/args";
import { codebaseCommand } from "./commands/codebase/mod.ts";
import { systemCommand } from "./commands/system.ts";
import { installHandler, updateHandler } from "./commands/handlers/mod.ts";
import config from "./package.json" with { type: "json" };

type CommandHandler = (
  args: string[],
  flags: Record<string, unknown>,
) => Promise<void>;

// Wrapper to adapt Command.parse() to the old handler signature
const wrapCommand = (
  cmd: { parse: (args: string[]) => Promise<void> },
): CommandHandler => {
  return async (args: string[], _flags: Record<string, unknown>) => {
    await cmd.parse(args);
  };
};

// Wrapper to adapt new handler to old signature
const wrapHandler = (
  handler: (ctx: CommandContext) => Promise<void>,
  commandName: string,
): CommandHandler => {
  return async (_args: string[], flags: Record<string, unknown>) => {
    // Create a minimal CommandLike for the root
    const mockRoot: CommandLike = {
      name: "eser",
      completions: () => "",
      help: () => "",
    };
    await handler({
      args: [],
      flags,
      root: mockRoot,
      commandPath: ["eser", commandName],
    });
  };
};

const versionCommand = new Command("version")
  .description("Show version number")
  .flag({
    name: "bare",
    type: "boolean",
    description: "Output version number only, without 'eser' prefix",
  })
  .run((ctx) => {
    if (ctx.flags["bare"] === true) {
      // deno-lint-ignore no-console
      console.log(config.version);
    } else {
      // deno-lint-ignore no-console
      console.log(`eser ${config.version}`);
    }
    return Promise.resolve();
  });

const commands: Record<string, CommandHandler> = {
  codebase: codebaseCommand,
  system: wrapCommand(systemCommand),
  install: wrapHandler(installHandler, "install"),
  update: wrapHandler(updateHandler, "update"),
  version: wrapCommand(versionCommand),
};

const showHelp = (): void => {
  // deno-lint-ignore no-console
  console.log("eser - Eser Ozvataf's command-line tooling to access things\n");
  // deno-lint-ignore no-console
  console.log("Usage: eser <command> [subcommand] [options]\n");
  // deno-lint-ignore no-console
  console.log("Commands:");
  // deno-lint-ignore no-console
  console.log("  codebase    Codebase validation and management tools");
  // deno-lint-ignore no-console
  console.log("  system      System management and setup tools");
  // deno-lint-ignore no-console
  console.log(
    "  install     Install eser CLI globally (alias for system install)",
  );
  // deno-lint-ignore no-console
  console.log(
    "  update      Update eser CLI to latest version (alias for system update)",
  );
  // deno-lint-ignore no-console
  console.log("  version     Show version number");
  // deno-lint-ignore no-console
  console.log("\nOptions:");
  // deno-lint-ignore no-console
  console.log("  -h, --help  Show this help message");
  // deno-lint-ignore no-console
  console.log("\nRun 'eser <command> --help' for command-specific help.");
};

export const main = async (): Promise<void> => {
  // @ts-ignore parseArgs doesn't mutate the array, readonly is safe
  const args = cliParseArgs.parseArgs(standardsRuntime.runtime.process.args, {
    boolean: ["help"],
    alias: { h: "help" },
    stopEarly: true, // Stop parsing at first non-option to pass rest to subcommand
  });

  const command = args._[0] as string | undefined;

  // Show main help only if no command or help without command
  if (command === undefined) {
    showHelp();
    return;
  }

  const handler = commands[command];
  if (handler === undefined) {
    // deno-lint-ignore no-console
    console.error(`Unknown command: ${command}`);
    // deno-lint-ignore no-console
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
