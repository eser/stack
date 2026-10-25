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
import * as streams from "@eserstack/streams";
import * as module from "@eserstack/shell/module";
import * as aiModule from "@eserstack/ai/module";
import * as kitModule from "@eserstack/kit/module";
import * as codebaseModule from "@eserstack/codebase/module";
import * as cliSupport from "@eserstack/codebase/cli-support";
import * as workflowsModule from "@eserstack/workflows/module";

import * as noskillsModule from "@eserstack/noskills/module";
import * as postsModule from "@eserstack/posts/module";
import * as larouxModule from "@eserstack/laroux-server/module";
import config from "./package.json" with { type: "json" };

const cliModule = new module.Module({
  description: "Terminal client for Eser's work",
});
cliModule.addSubmodule({ name: "ai" }, aiModule.moduleDef);
cliModule.addSubmodule({ name: "kit" }, kitModule.moduleDef);
cliModule.addSubmodule(
  { name: "codebase", aliases: ["cb", "."] },
  codebaseModule.moduleDef,
);
cliModule.addSubmodule(
  { name: "noskills", aliases: ["nos"] },
  noskillsModule.moduleDef,
);
cliModule.addSubmodule({ name: "posts" }, postsModule.moduleDef);
cliModule.addSubmodule({ name: "laroux" }, larouxModule.moduleDef);

const app = cliSupport.attachStandardCommands(
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
      const validation = await import("@eserstack/codebase/validation");

      return workflowsModule.createModuleDef(validation.getWorkflowTools())
        .toCommand("workflows", config.version);
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

    // The manifest is YAML the user edits, so its entries stay unchecked here;
    // runScript checks every entry it runs.
    if (scriptEntries instanceof Object && !Array.isArray(scriptEntries)) {
      const scripts = scriptEntries as Readonly<Record<string, unknown>>;

      // Object.hasOwn, so "toString" and the other names every object inherits
      // are not taken for scripts.
      if (Object.hasOwn(scripts, commandName)) {
        const scriptRunner = await import("./scripts.ts");
        return await scriptRunner.runScript(commandName, scripts, args);
      }
    }

    // External subcommands, the git way: `eser <name>` runs `eser-<name>` from
    // PATH. Generic on purpose — the stack ships Go binaries this CLI cannot
    // absorb, and a
    // one-off case for each would be a registry nobody remembers to update.
    //
    // After manifest scripts, so project-local intent wins over an installed
    // plugin of the same name.
    const plugins = await import("./plugins.ts");
    const executable = await plugins.resolvePlugin(commandName);

    if (executable !== null) {
      const exitCode = await plugins.runPlugin(executable, args);

      return exitCode === 0
        ? results.ok(undefined)
        : results.fail({ exitCode });
    }

    // exitCli prints the message on stderr before it exits.
    return results.fail({
      message: `Unknown subcommand "${commandName}"\n` +
        `  No built-in command, manifest script, or "eser-${commandName}" ` +
        `executable on PATH.`,
      exitCode: 1,
    });
  });

/**
 * The one-line notice for a run from a `deno install jsr:@eserstack/cli`
 * install, whose main module is served from jsr.io, or null for any other
 * install. JSR stays frozen at 4.5.x (decision-5).
 */
export const jsrInstallNotice = (mainModuleUrl: string): string | null =>
  mainModuleUrl.startsWith("https://jsr.io/")
    ? "eser on JSR is frozen at 4.5.x; from 5.0.0 install it with `npm install -g eser` or the install script (https://github.com/eser/stack#install-the-cli)."
    : null;

export const main = async (): Promise<
  results.Result<void, { message?: string; exitCode: number }>
> => {
  return await app.parse();
};

if (import.meta.main) {
  // exitCli drains buffered output then hard-exits — see its docs for why the
  // native FFI teardown makes a natural exit unsafe here.
  //
  // Entry point: the await runs only when this file is the program, never on
  // import.
  const notice = jsrInstallNotice(import.meta.url);
  if (notice !== null) {
    const errorOutput = streams.output({
      renderer: streams.renderers.plain(),
      sink: streams.sinks.stderr(),
    });
    errorOutput.writeln(notice);
    // deno-lint-ignore no-top-level-await
    await errorOutput.close();
  }

  // deno-lint-ignore no-top-level-await
  await cliSupport.exitCli(await main());
}
