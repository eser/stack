// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * eser - Eser Ozvataf's command-line tooling to access things
 *
 * A multi-purpose command-line tool that dispatches to library modules.
 *
 * Usage:
 *   deno run -A ./main.ts <command> [subcommand] [options]
 *   npx eser <command> [subcommand] [options]
 *
 * Commands:
 *   codebase    Codebase management tools (versions, validation, scaffolding, ...)
 *   laroux      laroux.js framework commands (init, dev, build, serve)
 *   system      Commands related with this CLI
 *   install     Install eser CLI globally (alias for system install)
 *   update      Update eser CLI to latest version (alias for system update)
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import { fail, match, ok } from "@eser/functions/results";
import * as standardsRuntime from "@eser/standards/runtime";
import {
  type CliResult,
  type CommandContext,
  type CommandLike,
} from "@eser/shell/args";
import { dispatch, showPackageHelp } from "./dispatch.ts";
import { registry } from "./registry.ts";
import config from "./package.json" with { type: "json" };

type CommandHandler = (
  args: string[],
  flags: Record<string, unknown>,
) => Promise<CliResult<void>>;

// Wrapper to adapt Command.parse() to CommandHandler signature
const wrapCommand = (
  cmd: { parse: (args: string[]) => Promise<CliResult<void>> },
): CommandHandler => {
  return async (args: string[], _flags: Record<string, unknown>) => {
    return await cmd.parse(args);
  };
};

// Wrapper to adapt handler to CommandHandler signature
const wrapHandler = (
  handler: (ctx: CommandContext) => Promise<CliResult<void>>,
  commandName: string,
): CommandHandler => {
  return async (_args: string[], flags: Record<string, unknown>) => {
    const mockRoot: CommandLike = {
      name: "eser",
      completions: () => "",
      help: () => "",
    };
    return await handler({
      args: [],
      flags,
      root: mockRoot,
      commandPath: ["eser", commandName],
    });
  };
};

// Tier 2 & 3: Lazy-loaded intrinsic commands (orchestration + CLI-specific)
const intrinsicCommands: Record<
  string,
  () => Promise<CommandHandler>
> = {
  laroux: async () => {
    const { larouxCommand } = await import("./commands/laroux/mod.ts");
    return wrapCommand(larouxCommand);
  },
  system: async () => {
    const { systemCommand } = await import("./commands/system.ts");
    return wrapCommand(systemCommand);
  },
  install: async () => {
    const { installHandler } = await import("./commands/handlers/mod.ts");
    return wrapHandler(installHandler, "install");
  },
  update: async () => {
    const { updateHandler } = await import("./commands/handlers/mod.ts");
    return wrapHandler(updateHandler, "update");
  },
  version: () => {
    const handler: CommandHandler = (_args, flags) => {
      if (flags["bare"] === true) {
        console.log(config.version);
      } else {
        console.log(`eser ${config.version}`);
      }
      return Promise.resolve(ok(undefined));
    };
    return Promise.resolve(handler);
  },
};

const showHelp = (): void => {
  console.log("eser - Eser Ozvataf's command-line tooling to access things\n");
  console.log("Usage: eser <command> [subcommand] [options]\n");
  console.log("Commands:");

  // Registry-based commands (Tier 1)
  for (const [name, pkg] of Object.entries(registry)) {
    console.log(`  ${name.padEnd(14)} ${pkg.description}`);
  }

  // Intrinsic commands (Tier 2 & 3)
  console.log(
    "  laroux        laroux.js framework commands (init, dev, build, serve)",
  );
  console.log("  system        Commands related with this CLI");
  console.log(
    "  install       Install eser CLI globally (alias for system install)",
  );
  console.log(
    "  update        Update eser CLI to latest version (alias for system update)",
  );
  console.log("  version       Show version number");

  console.log("\nOptions:");
  console.log("  -h, --help    Show this help message");
  console.log("\nRun 'eser <command> --help' for command-specific help.");
};

export const main = async (): Promise<CliResult<void>> => {
  // @ts-ignore parseArgs doesn't mutate the array, readonly is safe
  const args = cliParseArgs.parseArgs(standardsRuntime.runtime.process.args, {
    boolean: ["help", "bare"],
    alias: { h: "help" },
    stopEarly: true,
  });

  const command = args._[0] as string | undefined;

  if (command === undefined) {
    showHelp();
    return ok(undefined);
  }

  // Tier 1: Registry-based dispatch (dynamic import → module main())
  if (command in registry) {
    const moduleName = args._[1] as string | undefined;

    if (moduleName === undefined || args.help === true) {
      showPackageHelp(command);
      return ok(undefined);
    }

    const remainingArgs = args._.slice(2) as string[];
    return await dispatch(command, moduleName, remainingArgs);
  }

  // Tier 2 & 3: Intrinsic commands (lazy-loaded)
  if (command in intrinsicCommands) {
    const loader = intrinsicCommands[command]!;
    const handler = await loader();
    return await handler(args._.slice(1) as string[], args);
  }

  console.error(`Unknown command: ${command}`);
  console.log("");
  showHelp();
  return fail({ exitCode: 1 });
};

if (import.meta.main) {
  const result = await main();
  match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        console.error(error.message);
      }
      standardsRuntime.runtime.process.setExitCode(error.exitCode);
    },
  });
}
