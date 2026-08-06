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
import { Module } from "@eserstack/shell/module";
import { moduleDef as aiModule } from "@eserstack/ai/module";
import { moduleDef as kitModule } from "@eserstack/kit/module";
import { moduleDef as codebaseModule } from "@eserstack/codebase/module";
import {
  attachStandardCommands,
  exitCli,
} from "@eserstack/codebase/cli-support";
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
cliModule.addSubmodule({ name: "noskills", aliases: ["nos"] }, noskillsModule);
cliModule.addSubmodule({ name: "posts" }, postsModule);
cliModule.addSubmodule({ name: "laroux" }, larouxModule);

const app = attachStandardCommands(
  cliModule.toCommand("eser", config.version),
  {
    npmPackage: "eser",
    jsrPackage: "@eserstack/cli",
    devCommand: "deno task cli",
  },
)
  // Lazy, not eager.
  //
  // This was a TOP-LEVEL await, so `@eserstack/codebase/validation` -- which
  // eagerly imports ~25 validator modules -- was loaded on every single
  // invocation, including `eser --help` and `eser version`. Measured at ~25ms of
  // marginal cost on a ~100ms command, paid by every user who never runs a
  // workflow.
  .lazyCommand("workflows", {
    description: "Workflow engine — run tool pipelines",
    aliases: ["wf"],
    load: async () => {
      const { getWorkflowTools } = await import(
        "@eserstack/codebase/validation"
      );

      return createWorkflowsModule(getWorkflowTools()).toCommand(
        "workflows",
        config.version,
      );
    },
  })
  .lazyCommand("ajan", {
    description: "Ajan native bridge commands",
    load: async () => {
      const mod = await import("./commands/ajan.ts");
      return mod.ajanCommand;
    },
  })
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

    // External subcommands, the git way: `eser <name>` runs `eser-<name>` from
    // PATH. Generic on purpose — the stack ships Go binaries this CLI cannot
    // absorb, and a
    // one-off case for each would be a registry nobody remembers to update.
    //
    // After manifest scripts, so project-local intent wins over an installed
    // plugin of the same name.
    const { resolvePlugin, runPlugin } = await import("./plugins.ts");
    const executable = await resolvePlugin(commandName);

    if (executable !== null) {
      const exitCode = await runPlugin(executable, args as string[]);

      return exitCode === 0
        ? results.ok(undefined)
        : results.fail({ exitCode });
    }

    // deno-lint-ignore no-console
    console.error(
      `Unknown subcommand "${commandName}"\n` +
        `  No built-in command, manifest script, or "eser-${commandName}" ` +
        `executable on PATH.`,
    );

    return results.fail({ exitCode: 1 });
  });

export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  // exitCli drains buffered output then hard-exits — see its docs for why the
  // native FFI teardown makes a natural exit unsafe here.
  await exitCli(await main());
}
