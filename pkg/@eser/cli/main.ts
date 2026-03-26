// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * eser — Terminal client for Eser's work
 *
 * A multi-purpose command-line tool that dispatches to library modules.
 * Uses the @eser/shell/args Command framework for routing, with lazy
 * loading for all command modules.
 *
 * Usage:
 *   deno run --allow-all ./main.ts <command> [subcommand] [options]
 *   npx eser <command> [subcommand] [options]
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as standardsRuntime from "@eser/standards/runtime";
import { Command } from "@eser/shell/args";
import { registry } from "./registry.ts";
import config from "./package.json" with { type: "json" };

const app = new Command("eser")
  .description("Terminal client for Eser's work")
  .version(config.version)
  // Tier 1: Registry packages (lazy module groups)
  .moduleGroup("kit", registry["kit"]!)
  .moduleGroup("codebase", registry["codebase"]!)
  .moduleGroup("workflows", registry["workflows"]!)
  // Tier 2: Framework commands (lazy Command trees)
  .lazyCommand("laroux", {
    description: "laroux.js framework commands (init, dev, build, serve)",
    load: async () => {
      const mod = await import("./commands/laroux/mod.ts");
      return mod.larouxCommand;
    },
  })
  .lazyCommand("system", {
    description: "Commands related with this CLI",
    load: async () => {
      const mod = await import("./commands/system.ts");
      return mod.systemCommand;
    },
  })
  // Tier 3: Convenience aliases (lazy handlers)
  .lazyCommand("install", {
    description: "Install eser CLI globally (alias for system install)",
    load: async () => {
      const mod = await import("./commands/handlers/mod.ts");
      return new Command("install").run(mod.installHandler);
    },
  })
  .lazyCommand("update", {
    description: "Update eser CLI to latest version (alias for system update)",
    load: async () => {
      const mod = await import("./commands/handlers/mod.ts");
      return new Command("update").run(mod.updateHandler);
    },
  })
  .lazyCommand("version", {
    description: "Show version number",
    load: async () => {
      const mod = await import("./commands/handlers/mod.ts");
      return new Command("version")
        .flag({
          name: "bare",
          type: "boolean",
          description: "Print raw version only",
        })
        .run(mod.versionHandler);
    },
  })
  .lazyCommand("doctor", {
    description: "Run diagnostic checks",
    load: async () => {
      const mod = await import("./commands/handlers/mod.ts");
      return new Command("doctor").run(mod.doctorHandler);
    },
  })
  // Tier 4: Manifest scripts (loaded only on unrecognized commands)
  .fallback(async (commandName, args) => {
    const configManifest = await import("@eser/config/manifest");
    const manifest = await configManifest.loadManifest(".");
    const scriptEntries = manifest?.["scripts"];

    if (
      scriptEntries !== undefined &&
      scriptEntries !== null &&
      typeof scriptEntries === "object"
    ) {
      const scripts = scriptEntries as Readonly<
        Record<string, import("@eser/workflows").ScriptConfig>
      >;

      if (commandName in scripts) {
        const scriptConfig = scripts[commandName]!;
        const { runScript } = await import("./scripts.ts");
        return await runScript(
          commandName,
          scriptConfig,
          scripts,
          args as string[],
        );
      }
    }

    // deno-lint-ignore no-console
    console.error(`Unknown command: ${commandName}`);
    return results.fail({ exitCode: 1 });
  });

export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        // deno-lint-ignore no-console
        console.error(error.message);
      }
      standardsRuntime.current.process.setExitCode(error.exitCode);
    },
  });
}
