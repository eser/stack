// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * eser — Terminal client for Eser's work
 *
 * A multi-purpose command-line tool that dispatches to library modules.
 * Uses the @eserstack/shell/args Command framework for routing, with lazy
 * loading for all command modules.
 *
 * Usage:
 *   deno run --allow-all ./main.ts <command> [subcommand] [options]
 *   npx eser <command> [subcommand] [options]
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import { Module } from "@eserstack/shell/module";
import { moduleDef as aiModule } from "@eserstack/ai/module";
import { moduleDef as kitModule } from "@eserstack/kit/module";
import { moduleDef as codebaseModule } from "@eserstack/codebase/module";
import { createModuleDef as createWorkflowsModule } from "@eserstack/workflows/module";

import { moduleDef as noskillsModule } from "@eserstack/noskills/module";
import { moduleDef as postsModule } from "@eserstack/posts/module";
import { moduleDef as larouxModule } from "@eserstack/laroux-server/module";
import config from "./package.json" with { type: "json" };

const cliModule = new Module({
  description: "Terminal client for Eser's work",
});
cliModule.addSubmodule({ name: "ai" }, aiModule);
cliModule.addSubmodule({ name: "kit" }, kitModule);
cliModule.addSubmodule(
  { name: "codebase", aliases: ["cb", "."] },
  codebaseModule,
);
await cliModule.addSubmoduleAsync(
  { name: "workflows", aliases: ["wf"] },
  (async () => {
    const { getWorkflowTools } = await import("@eserstack/codebase/validation");
    return createWorkflowsModule(getWorkflowTools());
  })(),
);
cliModule.addSubmodule({ name: "noskills", aliases: ["nos"] }, noskillsModule);
cliModule.addSubmodule({ name: "posts" }, postsModule);
cliModule.addSubmodule({ name: "laroux" }, larouxModule);

const app = cliModule
  .toCommand("eser", config.version)
  .lazyCommand("system", {
    description: "Commands related with this CLI",
    load: async () => {
      const mod = await import("./commands/system.ts");
      return mod.systemCommand;
    },
  })
  .shortcut("install", "system install", "Install eser CLI globally")
  .shortcut("update", "system update", "Update eser CLI to latest version")
  .shortcut("version", "system version", "Show version number")
  .shortcut("doctor", "system doctor", "Run diagnostic checks")
  // Manifest scripts (loaded only on unrecognized commands)
  .fallback(async (commandName, args) => {
    const configManifest = await import("@eserstack/config/manifest");
    const manifest = await configManifest.loadManifest(".");
    const scriptEntries = manifest?.["scripts"];

    if (
      scriptEntries !== undefined &&
      scriptEntries !== null &&
      typeof scriptEntries === "object"
    ) {
      const scripts = scriptEntries as Readonly<
        Record<string, import("@eserstack/workflows/mod").ScriptConfig>
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
    console.error(`Unknown subcommand "${commandName}"`);
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
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
