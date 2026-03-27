// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Clone command — CLI adapter for the clone-recipe handler.
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";
import * as results from "@eser/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as task from "@eser/functions/task";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import * as cloneRecipeHandler from "../recipes/handlers/clone-recipe.ts";
import type * as shellArgs from "@eser/shell/args";

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["recipe", "name", "var"],
    boolean: ["force", "dry-run", "skip-existing", "verbose"],
    collect: ["var"],
    alias: { p: "name" },
  });

  const specifierRaw = parsed._[0] as string | undefined;
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  if (specifierRaw === undefined) {
    out.writeln("Usage: eser kit clone <specifier> [options]");
    out.writeln();
    out.writeln("Specifier formats:");
    out.writeln(
      "  owner/repo                 GitHub repo (default branch)",
    );
    out.writeln(
      "  owner/repo#ref             GitHub repo at specific tag/branch",
    );
    out.writeln();
    out.writeln("Options:");
    out.writeln(
      "  --recipe <path>            Path to recipe.json (default: recipe.json)",
    );
    out.writeln(
      "  --name, -p <dir>           Target directory",
    );
    out.writeln(
      "  --var key=value            Template variable (repeatable)",
    );
    out.writeln(
      "  --force                    Overwrite existing files",
    );
    out.writeln(
      "  --dry-run                  Preview without writing",
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
      projectName: parsed["name"] as string | undefined,
      dryRun: parsed["dry-run"] === true,
      force: parsed["force"] === true,
      skipExisting: parsed["skip-existing"] === true,
      verbose: parsed["verbose"] === true,
      variables,
    }),
    { out },
  );

  await out.close();

  if (results.isOk(handlerResult)) {
    return results.ok(undefined);
  }

  return results.fail({ exitCode: 1 });
};
