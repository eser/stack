// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Scaffolding module for creating projects from templates
 *
 * A degit-like system for downloading and processing templates from various sources.
 * Supports variable substitution using Go template syntax ({{.variable_name}}).
 *
 * Can be used as a library or as a standalone script.
 *
 * Library usage:
 * ```typescript
 * import { scaffold } from "@eser/codebase/scaffolding";
 *
 * await scaffold({
 *   specifier: "eser/ajan",  // GitHub repo
 *   targetDir: "./my-project",
 *   variables: { project_name: "my-app" },
 * });
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./scaffolding/mod.ts eser/ajan
 *   deno run --allow-all ./scaffolding/mod.ts eser/ajan -p ./my-project
 *   deno run --allow-all ./scaffolding/mod.ts gh:eser/ajan#v1.0 --force
 *   deno run --allow-all ./scaffolding/mod.ts eser/ajan --var name=my-app --var author=me
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as span from "@eser/streams/span";
import * as streams from "@eser/streams";
import * as results from "@eser/primitives/results";
import { runtime } from "@eser/standards/cross-runtime";
import * as shellArgs from "@eser/shell/args";

// Main scaffold function
export { scaffold } from "./scaffold.ts";
import { scaffold } from "./scaffold.ts";

// Types
export type {
  ScaffoldOptions,
  ScaffoldResult,
  TemplateConfig,
  TemplateVariable,
} from "./types.ts";

// Provider system
export {
  fetchTemplate,
  getDefaultProvider,
  getProvider,
  parseSpecifier,
  registerProvider,
} from "./providers/mod.ts";

export type {
  GitHubRef,
  ParsedSpecifier,
  Provider,
  ProviderRef,
} from "./providers/mod.ts";

// Config utilities
export { loadTemplateConfig, resolveVariables } from "./config.ts";

// Processing utilities
export { hasVariables, substituteVariables } from "./processor.ts";

/**
 * CLI main function for standalone usage.
 */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const args: {
    _: (string | number)[];
    path?: string;
    var?: string[];
    force?: boolean;
    interactive?: boolean;
    "skip-post-install"?: boolean;
    help?: boolean;
  } = cliParseArgs.parseArgs(
    (cliArgs ?? runtime.process.args) as string[],
    {
      string: ["path", "var"],
      boolean: ["force", "interactive", "skip-post-install", "help"],
      alias: { p: "path", f: "force", i: "interactive", h: "help" },
      collect: ["var"],
    },
  ) as ReturnType<typeof cliParseArgs.parseArgs>;

  if (args["help"]) {
    console.log(
      "Usage: scaffold <specifier> [options]\n" +
        "\nOptions:\n" +
        "  -p, --path <dir>       Target directory (default: .)\n" +
        "  -f, --force            Overwrite existing files\n" +
        "  -i, --interactive      Prompt for missing variables\n" +
        "  --var key=value        Set a template variable (repeatable)\n" +
        "  --skip-post-install    Skip post-install commands\n" +
        "  -h, --help             Show this help message\n" +
        "\nExamples:\n" +
        "  scaffold eser/ajan\n" +
        "  scaffold gh:eser/ajan#v1.0 -p ./my-project\n" +
        "  scaffold eser/ajan --var name=my-app --var author=me",
    );
    return results.ok(undefined);
  }

  const renderer = streams.renderers.ansi();

  const out = streams.output({
    renderer,
    sink: streams.sinks.stdout(),
  });

  if (args._.length === 0) {
    await out.close();
    return results.fail({
      message:
        `${
          renderer.render([span.red("Error: Template specifier is required")])
        }\n` +
        "\nUsage: scaffold <specifier> [options]\n" +
        "\nExamples:\n" +
        "  scaffold eser/ajan\n" +
        "  scaffold gh:eser/ajan#v1.0\n" +
        "  scaffold eser/ajan -p ./my-project",
      exitCode: 1,
    });
  }

  const specifier = String(args._[0]);

  const targetDir = (args["path"] as string | undefined) ?? ".";
  const force = args["force"] as boolean | undefined ?? false;
  const skipPostInstall = args["skip-post-install"] as boolean | undefined ??
    false;
  const interactive = args["interactive"] as boolean | undefined ?? false;

  // Parse --var flags into variables object
  const varFlags = args["var"] as string[];
  const variables: Record<string, string> = {};

  if (varFlags !== undefined) {
    for (const v of varFlags) {
      const [key, ...valueParts] = String(v).split("=");
      if (key !== undefined) {
        variables[key] = valueParts.join("=");
      }
    }
  }

  out.writeln(
    span.text("Scaffolding from "),
    span.cyan(specifier),
    span.text("..."),
  );

  const scaffoldResult = await results.tryCatchAsync(
    () =>
      scaffold({
        specifier,
        targetDir,
        variables,
        force,
        skipPostInstall,
        interactive,
      }),
    (error) => ({ message: (error as Error).message }),
  );

  if (results.isFail(scaffoldResult)) {
    await out.close();
    return results.fail({
      message: renderer.render([
        span.red(`\nScaffolding failed: ${scaffoldResult.error.message}`),
      ]),
      exitCode: 1,
    });
  }

  const result = scaffoldResult.value;

  out.writeln(
    span.green(
      `\nScaffolded ${result.templateName} to ${result.targetDir}`,
    ),
  );

  if (Object.keys(result.variables).length > 0) {
    out.writeln(span.text("\nVariables applied:"));
    for (const [key, value] of Object.entries(result.variables)) {
      out.writeln(span.text("  "), span.dim(key), span.text(`: ${value}`));
    }
  }

  if (result.postInstallCommands.length > 0) {
    out.writeln(span.text("\nPost-install commands executed:"));
    for (const cmd of result.postInstallCommands) {
      out.writeln(span.text("  "), span.dim(cmd));
    }
  }

  await out.close();
  return results.ok(undefined);
};

if (import.meta.main) {
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        console.error(error.message);
      }
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
