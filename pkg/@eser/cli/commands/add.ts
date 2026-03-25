// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Add command — apply a recipe from the registry to the current project.
 *
 * Usage:
 *   eser kit add <recipe> [--registry <url>] [--dry-run] [--force]
 *                            [--skip-existing] [--verbose] [--local]
 *                            [--var key=value ...]
 *
 * @module
 */

import * as fmtColors from "@eser/shell/formatting/colors";
import * as results from "@eser/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as shellArgs from "@eser/shell/args";
import * as registryFetcher from "@eser/registry/fetcher";
import * as recipeApplier from "@eser/registry/applier";
import * as dependencyResolver from "@eser/registry/resolver";

const parseVarFlags = (varFlags: string[]): Record<string, string> => {
  const variables: Record<string, string> = {};

  for (const v of varFlags) {
    const [key, ...valueParts] = String(v).split("=");
    if (key !== undefined && key !== "") {
      variables[key] = valueParts.join("=");
    }
  }

  return variables;
};

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["registry", "var"],
    boolean: ["dry-run", "force", "skip-existing", "verbose", "local"],
    collect: ["var"],
  });

  const recipeName = parsed._[0] as string | undefined;
  const registryUrl = parsed["registry"] as string | undefined;
  const dryRun = parsed["dry-run"] === true;
  const force = parsed["force"] === true;
  const skipExisting = parsed["skip-existing"] === true;
  const verbose = parsed["verbose"] === true;
  const local = parsed["local"] === true;
  const variables = parseVarFlags(parsed["var"] as string[]);

  if (recipeName === undefined) {
    // deno-lint-ignore no-console
    console.log(
      "Usage: eser kit add <recipe> [--registry <url>] [--dry-run] [--var key=value]",
    );
    // deno-lint-ignore no-console
    console.log("\nRun `eser kit list` to see available recipes.");
    return results.ok(undefined);
  }

  try {
    // Fetch registry (with local auto-detection)
    const manifest = await registryFetcher.fetchRegistry(registryUrl, {
      verbose,
      local,
    });

    // Find recipe
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

    // Detect project type and check for language mismatch
    const cwd = Deno.cwd();
    const project = await dependencyResolver.detectProjectType(cwd);
    const depInfo = dependencyResolver.getDependencyInstructions(
      recipe,
      project,
    );

    for (const warning of depInfo.warnings) {
      // deno-lint-ignore no-console
      console.warn(fmtColors.yellow(`Warning: ${warning}`));
    }

    if (dryRun) {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.cyan(`\nDry run: ${recipe.name} (${recipe.description})\n`),
      );
    } else {
      // deno-lint-ignore no-console
      console.log(fmtColors.cyan(`\nAdding ${recipe.name}...\n`));
    }

    // Apply recipe chain (resolves requires automatically)
    const chainResult = await recipeApplier.applyRecipeChain(
      recipeName,
      manifest.recipes,
      {
        cwd,
        registryUrl: manifest.registryUrl,
        force,
        skipExisting,
        dryRun,
        verbose,
        variables,
      },
    );

    // Summary
    const verb = dryRun ? "Would write" : "Added";
    let totalWritten = 0;
    let totalSkipped = 0;

    for (const entry of chainResult.recipes) {
      totalWritten += entry.result.written.length;
      totalSkipped += entry.result.skipped.length;
    }

    // deno-lint-ignore no-console
    console.log(
      fmtColors.green(`\n✓ ${verb} ${totalWritten} file(s)`),
    );

    if (chainResult.recipes.length > 1) {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.dim(
          `  Applied ${chainResult.recipes.length} recipes (including dependencies)`,
        ),
      );
    }

    if (totalSkipped > 0) {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.dim(`  Skipped ${totalSkipped} existing file(s)`),
      );
    }

    // Show written files from the target recipe (not deps)
    const targetResult = chainResult.recipes.find(
      (r) => r.name === recipeName,
    );

    if (targetResult !== undefined) {
      for (const file of targetResult.result.written) {
        // deno-lint-ignore no-console
        console.log(`  → ${file}`);
      }
    }

    // Print dependency instructions
    if (depInfo.instructions.length > 0) {
      // deno-lint-ignore no-console
      console.log(fmtColors.dim("\nDependencies:"));
      for (const instruction of depInfo.instructions) {
        // deno-lint-ignore no-console
        console.log(fmtColors.dim(`  Run: ${instruction}`));
      }
    }

    return results.ok(undefined);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // deno-lint-ignore no-console
    console.error(fmtColors.red(`Error: ${msg}`));
    return results.fail({ exitCode: 1 });
  }
};
