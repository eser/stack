// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Update command — CLI adapter for the update-recipe handler.
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";
import * as results from "@eser/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as task from "@eser/functions/task";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import * as updateRecipeHandler from "../recipes/handlers/update-recipe.ts";
import type * as shellArgs from "@eser/shell/args";

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["registry"],
    boolean: ["dry-run", "verbose", "local"],
  });

  const recipeName = parsed._[0] as string | undefined;
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  if (recipeName === undefined) {
    out.writeln(
      "Usage: eser kit update <recipe> [--registry <url>] [--dry-run]",
    );
    out.writeln();
    out.writeln(
      "Re-fetches and re-applies a recipe, overwriting existing files.",
    );
    await out.close();
    return results.ok(undefined);
  }

  const dryRun = parsed["dry-run"] === true;

  if (dryRun) {
    out.writeln(span.cyan(`\nDry run: updating ${recipeName}\n`));
  } else {
    out.writeln(span.cyan(`\nUpdating ${recipeName}...\n`));
  }

  const handlerResult = await task.runTask(
    updateRecipeHandler.updateRecipe({
      recipeName,
      cwd: runtime.process.cwd(),
      registrySource: parsed["registry"] as string | undefined,
      local: parsed["local"] === true,
      dryRun,
      verbose: parsed["verbose"] === true,
    }),
    { out },
  );

  await out.close();

  if (results.isOk(handlerResult)) {
    return results.ok(undefined);
  }

  return results.fail({ exitCode: 1 });
};
