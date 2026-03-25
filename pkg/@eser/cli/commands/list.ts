// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * List command — browse available recipes from the registry.
 *
 * Usage:
 *   eser kit list [--language <lang>] [--scale <scale>] [--tag <tag>] [--registry <url>]
 *
 * @module
 */

import * as fmtColors from "@eser/shell/formatting/colors";
import * as results from "@eser/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as shellArgs from "@eser/shell/args";
import * as registryFetcher from "@eser/registry/fetcher";
import * as registrySchema from "@eser/registry/schema";

const SCALE_ORDER: readonly registrySchema.RecipeScale[] = [
  "project",
  "structure",
  "utility",
];

const SCALE_LABELS: Record<registrySchema.RecipeScale, string> = {
  project: "PROJECTS",
  structure: "STRUCTURES",
  utility: "UTILITIES",
};

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const flags = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["registry", "language", "scale", "tag"],
    boolean: ["local"],
  });

  const registryUrl = flags["registry"] as string | undefined;
  const local = flags["local"] === true;
  const languageFilter = flags["language"] as string | undefined;
  const scaleFilter = flags["scale"] as string | undefined;
  const tagFilter = flags["tag"] as string | undefined;

  try {
    const manifest = await registryFetcher.fetchRegistry(registryUrl, {
      local,
    });

    let recipes = [...manifest.recipes];

    // Apply filters
    if (languageFilter !== undefined) {
      recipes = recipes.filter((r) => r.language === languageFilter);
    }
    if (scaleFilter !== undefined) {
      recipes = recipes.filter((r) => r.scale === scaleFilter);
    }
    if (tagFilter !== undefined) {
      recipes = recipes.filter((r) =>
        r.tags !== undefined && r.tags.includes(tagFilter)
      );
    }

    if (recipes.length === 0) {
      // deno-lint-ignore no-console
      console.log("No recipes found matching your filters.");
      // deno-lint-ignore no-console
      console.log(
        "Run `eser kit list` without filters to see all recipes.",
      );
      return results.ok(undefined);
    }

    // Group by scale
    // deno-lint-ignore no-console
    console.log(
      fmtColors.bold(`${manifest.name} — ${manifest.description}\n`),
    );

    for (const scale of SCALE_ORDER) {
      const group = recipes.filter((r) => r.scale === scale);

      if (group.length === 0) {
        continue;
      }

      // deno-lint-ignore no-console
      console.log(fmtColors.cyan(SCALE_LABELS[scale]));

      for (const recipe of group) {
        const lang = fmtColors.dim(`[${recipe.language}]`);
        // deno-lint-ignore no-console
        console.log(
          `  ${recipe.name.padEnd(20)} ${recipe.description} ${lang}`,
        );
      }

      // deno-lint-ignore no-console
      console.log();
    }

    return results.ok(undefined);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // deno-lint-ignore no-console
    console.error(fmtColors.red(`Error: ${msg}`));
    return results.fail({ exitCode: 1 });
  }
};
