// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Update command — re-fetch and re-apply a previously applied recipe.
 *
 * Usage:
 *   eser kit update <recipe> [--registry <url>] [--dry-run]
 *                               [--verbose] [--local]
 *
 * @module
 */

import * as fmtColors from "@eser/shell/formatting/colors";
import * as results from "@eser/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as shellArgs from "@eser/shell/args";
import * as registryFetcher from "@eser/registry/fetcher";
import * as recipeApplier from "@eser/registry/applier";

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["registry"],
    boolean: ["dry-run", "verbose", "local"],
  });

  const recipeName = parsed._[0] as string | undefined;
  const registryUrl = parsed["registry"] as string | undefined;
  const dryRun = parsed["dry-run"] === true;
  const verbose = parsed["verbose"] === true;
  const local = parsed["local"] === true;

  if (recipeName === undefined) {
    // deno-lint-ignore no-console
    console.log(
      "Usage: eser kit update <recipe> [--registry <url>] [--dry-run]",
    );
    // deno-lint-ignore no-console
    console.log(
      "\nRe-fetches and re-applies a recipe, overwriting existing files.",
    );
    return results.ok(undefined);
  }

  try {
    const manifest = await registryFetcher.fetchRegistry(registryUrl, {
      verbose,
      local,
    });

    const recipe = manifest.recipes.find((r) => r.name === recipeName);

    if (recipe === undefined) {
      // deno-lint-ignore no-console
      console.error(
        fmtColors.red(
          `Recipe '${recipeName}' not found. Run \`eser kit list\` to see available recipes.`,
        ),
      );
      return results.fail({ exitCode: 1 });
    }

    if (dryRun) {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.cyan(
          `\nDry run: updating ${recipe.name} (${recipe.description})\n`,
        ),
      );
    } else {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.cyan(`\nUpdating ${recipe.name}...\n`),
      );
    }

    // Apply with force to overwrite existing files
    const result = await recipeApplier.applyRecipe(recipe, {
      cwd: Deno.cwd(),
      registryUrl: manifest.registryUrl,
      force: true,
      dryRun,
      verbose,
    });

    const verb = dryRun ? "Would update" : "Updated";
    // deno-lint-ignore no-console
    console.log(
      fmtColors.green(
        `\n✓ ${verb} ${result.written.length} file(s) from ${recipe.name}`,
      ),
    );

    for (const file of result.written) {
      // deno-lint-ignore no-console
      console.log(`  → ${file}`);
    }

    return results.ok(undefined);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // deno-lint-ignore no-console
    console.error(fmtColors.red(`Error: ${msg}`));
    return results.fail({ exitCode: 1 });
  }
};
