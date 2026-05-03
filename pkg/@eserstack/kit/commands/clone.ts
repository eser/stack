// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Clone command — CLI adapter for the clone-recipe handler.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as results from "@eserstack/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as task from "@eserstack/functions/task";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import * as cloneRecipeHandler from "../recipes/handlers/clone-recipe.ts";
import type * as shellArgs from "@eserstack/shell/args";

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["recipe", "name", "var"],
    boolean: [
      "force",
      "dry-run",
      "skip-existing",
      "verbose",
      "interactive",
      "no-interactive",
      "no-post-install",
    ],
    collect: ["var"],
    alias: { p: "name", i: "interactive" },
  });

  const specifierRaw = parsed._[0] as string | undefined;
  const targetDirArg = parsed._[1] as string | undefined;
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  if (specifierRaw === undefined) {
    out.writeln("Usage: eser kit clone <specifier> [target-dir] [options]");
    out.writeln();
    out.writeln("Specifier formats:");
    out.writeln(
      "  owner/repo                     GitHub repo (default branch)",
    );
    out.writeln(
      "  owner/repo#ref                 GitHub repo at specific tag/branch",
    );
    out.writeln(
      "  gh:owner/repo/sub/path[#ref]   GitHub repo subpath",
    );
    out.writeln();
    out.writeln("Options:");
    out.writeln(
      "  --recipe <path>                Path to recipe.json (default: recipe.json)",
    );
    out.writeln(
      "  --name, -p <dir>               Project name / target directory",
    );
    out.writeln(
      "  --var key=value                Template variable (repeatable)",
    );
    out.writeln(
      "  --interactive, -i              Prompt for missing variables",
    );
    out.writeln(
      "  --no-post-install              Skip post-install commands",
    );
    out.writeln(
      "  --force                        Overwrite existing files",
    );
    out.writeln(
      "  --dry-run                      Preview without writing",
    );
    out.writeln(
      "  --skip-existing                Skip files that already exist",
    );
    out.writeln(
      "  --verbose                      Show verbose output",
    );
    await out.close();
    return results.ok(undefined);
  }

  const specifier = cloneRecipeHandler.parseSpecifier(specifierRaw);

  if (specifier === undefined) {
    out.writeln(
      span.red(
        `Invalid specifier: '${specifierRaw}'. Use format: owner/repo or gh:owner/repo#ref`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // Parse --var flags
  const variables: Record<string, string> = {};
  for (const v of (parsed["var"] as string[])) {
    const [key, ...valueParts] = String(v).split("=");
    if (key !== undefined && key !== "") {
      variables[key] = valueParts.join("=");
    }
  }

  // Positional target dir overrides --name when both absent; --name wins when present
  const projectName = parsed["name"] as string | undefined ?? targetDirArg;

  // Interactive mode: explicit flag OR auto-detect when stdin is a TTY (unless suppressed)
  const explicitInteractive = parsed["interactive"] === true;
  const noInteractive = parsed["no-interactive"] === true;
  const isTty = runtime.process.isTerminal("stdin");
  const interactive = !noInteractive && (explicitInteractive || isTty);

  if (!explicitInteractive && !noInteractive && isTty) {
    // Auto-enabled — inform the user so they know why they are being prompted
    // deno-lint-ignore no-console
    console.error(
      "Prompting for missing variables (use --no-interactive to disable)",
    );
  }

  const skipPostInstall = parsed["no-post-install"] === true;

  out.writeln(
    span.cyan(
      `\nCloning from ${specifier.owner}/${specifier.repo}@${specifier.ref}...\n`,
    ),
  );

  const handlerResult = await task.runTask(
    cloneRecipeHandler.cloneRecipe({
      specifier,
      recipePath: parsed["recipe"] as string | undefined,
      cwd: runtime.process.cwd(),
      projectName,
      dryRun: parsed["dry-run"] === true,
      force: parsed["force"] === true,
      skipExisting: parsed["skip-existing"] === true,
      verbose: parsed["verbose"] === true,
      variables,
      interactive,
      skipPostInstall,
    }),
    { out },
  );

  await out.close();

  if (results.isOk(handlerResult)) {
    return results.ok(undefined);
  }

  return results.fail({ exitCode: 1 });
};
