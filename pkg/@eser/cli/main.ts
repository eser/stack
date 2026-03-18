// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * eser - Eser's swiss-army-knife tooling for your terminal
 *
 * A multi-purpose command-line tool that dispatches to library modules.
 *
 * Usage:
 *   deno run --allow-all ./main.ts <command> [subcommand] [options]
 *   npx eser <command> [subcommand] [options]
 *
 * Commands:
 *   codebase    Codebase management tools (versions, validation, scaffolding, ...)
 *   laroux      laroux.js framework commands (init, dev, build, serve)
 *   system      Commands related with this CLI
 *   install     Install eser CLI globally (alias for system install)
 *   update      Update eser CLI to latest version (alias for system update)
 *   version     Show version number and check for updates
 *   doctor      Run diagnostic checks on the environment
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as results from "@eser/primitives/results";
import * as standardsRuntime from "@eser/standards/runtime";
import * as shellArgs from "@eser/shell/args";
import * as configManifest from "@eser/config/manifest";
import { dispatch, showPackageHelp } from "./dispatch.ts";
import { registry } from "./registry.ts";
import { runScript, showScripts } from "./scripts.ts";

type CommandHandler = (
  args: string[],
  flags: Record<string, unknown>,
) => Promise<shellArgs.CliResult<void>>;

// Wrapper to adapt Command.parse() to CommandHandler signature
const wrapCommand = (
  cmd: { parse: (args: string[]) => Promise<shellArgs.CliResult<void>> },
): CommandHandler => {
  return async (args: string[], _flags: Record<string, unknown>) => {
    return await cmd.parse(args);
  };
};

// Wrapper to adapt handler to CommandHandler signature
const wrapHandler = (
  handler: (
    ctx: shellArgs.CommandContext,
  ) => Promise<shellArgs.CliResult<void>>,
  commandName: string,
): CommandHandler => {
  return async (subArgs: string[], _flags: Record<string, unknown>) => {
    // Re-parse the subcommand's own args to capture flags after stopEarly
    const parsed = cliParseArgs.parseArgs(subArgs, {
      boolean: ["bare", "help"],
      string: ["shell"],
      alias: { h: "help" },
    });
    const mockRoot: shellArgs.CommandLike = {
      name: "eser",
      completions: () => "",
      help: () => "",
    };
    return await handler({
      args: parsed._ as string[],
      flags: parsed as Record<string, unknown>,
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
  version: async () => {
    const { versionHandler } = await import("./commands/handlers/mod.ts");
    return wrapHandler(versionHandler, "version");
  },
  doctor: async () => {
    const { doctorHandler } = await import("./commands/handlers/mod.ts");
    return wrapHandler(doctorHandler, "doctor");
  },
};

const showHelp = async (): Promise<void> => {
  console.log("eser - Eser's swiss-army-knife tooling for your terminal\n");
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
  console.log("  doctor        Run diagnostic checks");

  // Tier 4: Scripts from .manifest.yml
  const manifest = await configManifest.loadManifest(".");
  const manifestScripts = manifest?.["scripts"];
  if (
    manifestScripts !== undefined &&
    manifestScripts !== null &&
    typeof manifestScripts === "object"
  ) {
    console.log();
    showScripts(
      manifestScripts as Readonly<
        Record<string, import("@eser/workflows").ScriptConfig>
      >,
    );
  }

  console.log("\nOptions:");
  console.log("  -h, --help    Show this help message");
  console.log("\nRun 'eser <command> --help' for command-specific help.");
};

export const main = async (): Promise<shellArgs.CliResult<void>> => {
  // @ts-ignore parseArgs doesn't mutate the array, readonly is safe
  const args = cliParseArgs.parseArgs(standardsRuntime.current.process.args, {
    boolean: ["help", "bare"],
    alias: { h: "help" },
    stopEarly: true,
  });

  const command = args._[0] as string | undefined;

  if (command === undefined) {
    await showHelp();
    return results.ok(undefined);
  }

  // Tier 1: Registry-based dispatch (dynamic import → module main())
  if (command in registry) {
    const moduleName = args._[1] as string | undefined;

    if (
      moduleName === undefined || moduleName === "--help" ||
      moduleName === "-h" || args.help === true
    ) {
      showPackageHelp(command);
      return results.ok(undefined);
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

  // Tier 4: Scripts from .manifest.yml
  const manifest = await configManifest.loadManifest(".");
  const dispatchScripts = manifest?.["scripts"];
  if (
    dispatchScripts !== undefined &&
    dispatchScripts !== null &&
    typeof dispatchScripts === "object"
  ) {
    const scripts = dispatchScripts as Readonly<
      Record<string, import("@eser/workflows").ScriptConfig>
    >;
    if (command in scripts) {
      const scriptConfig = scripts[command]!;
      const remainingArgs = args._.slice(1) as string[];
      return await runScript(command, scriptConfig, scripts, remainingArgs);
    }
  }

  console.error(`Unknown command: ${command}`);
  console.log("");
  await showHelp();
  return results.fail({ exitCode: 1 });
};

if (import.meta.main) {
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        console.error(error.message);
      }
      standardsRuntime.current.process.setExitCode(error.exitCode);
    },
  });
}
