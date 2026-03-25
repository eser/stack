// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Clone command — apply a recipe from any GitHub repo.
 *
 * Fetches a recipe.json from the target repository and applies it
 * using the same infrastructure as registered recipes. No central
 * registry entry required.
 *
 * Usage:
 *   eser kit clone <specifier> [--recipe <path>] [--name <dir>]
 *                                [--var key=value ...] [--force]
 *                                [--dry-run] [--verbose]
 *
 * Specifier formats:
 *   eser/ajan                  → github.com/eser/ajan (default branch)
 *   gh:eser/ajan#v1.0          → github.com/eser/ajan at tag v1.0
 *   gh:eser/ajan#main          → github.com/eser/ajan at branch main
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

// =============================================================================
// Specifier parsing
// =============================================================================

interface ParsedSpecifier {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
}

/**
 * Parse a GitHub specifier into owner/repo/ref.
 *
 * Supported formats:
 *   "eser/ajan"           → { owner: "eser", repo: "ajan", ref: "main" }
 *   "gh:eser/ajan"        → { owner: "eser", repo: "ajan", ref: "main" }
 *   "gh:eser/ajan#v1.0"   → { owner: "eser", repo: "ajan", ref: "v1.0" }
 */
const parseSpecifier = (specifier: string): ParsedSpecifier | undefined => {
  // Strip gh: prefix if present
  const cleaned = specifier.replace(/^gh:/, "");

  // Split on # for ref
  const [repoPath, ref] = cleaned.split("#");
  if (repoPath === undefined) return undefined;

  // Split on / for owner/repo
  const parts = repoPath.split("/");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    return undefined;
  }

  return {
    owner: parts[0]!,
    repo: parts[1]!,
    ref: ref ?? "main",
  };
};

// =============================================================================
// Command
// =============================================================================

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
  const recipePath = (parsed["recipe"] as string | undefined) ?? "recipe.json";
  const projectName = parsed["name"] as string | undefined;
  const force = parsed["force"] === true;
  const dryRun = parsed["dry-run"] === true;
  const skipExisting = parsed["skip-existing"] === true;
  const verbose = parsed["verbose"] === true;

  // Parse --var flags
  const variables: Record<string, string> = {};
  for (const v of (parsed["var"] as string[])) {
    const [key, ...valueParts] = String(v).split("=");
    if (key !== undefined && key !== "") {
      variables[key] = valueParts.join("=");
    }
  }

  if (specifierRaw === undefined) {
    // deno-lint-ignore no-console
    console.log(`Usage: eser kit clone <specifier> [options]

Specifier formats:
  eser/ajan                  GitHub repo (default branch)
  gh:eser/ajan#v1.0          GitHub repo at specific tag/branch

Options:
  --recipe <path>            Path to recipe.json in the repo (default: recipe.json)
  --name, -p <dir>           Target directory (default: current directory)
  --var key=value             Template variable (repeatable)
  --force                    Overwrite existing files
  --dry-run                  Preview without writing
  --verbose                  Show detailed output`);
    return results.ok(undefined);
  }

  // Parse specifier
  const spec = parseSpecifier(specifierRaw);

  if (spec === undefined) {
    // deno-lint-ignore no-console
    console.error(
      fmtColors.red(
        `Invalid specifier: '${specifierRaw}'. Use format: owner/repo or gh:owner/repo#ref`,
      ),
    );
    return results.fail({ exitCode: 1 });
  }

  try {
    // deno-lint-ignore no-console
    console.log(
      fmtColors.cyan(
        `\nCloning from ${spec.owner}/${spec.repo}@${spec.ref}...\n`,
      ),
    );

    if (verbose) {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.dim(
          `  Fetching ${recipePath} from ${spec.owner}/${spec.repo}@${spec.ref}`,
        ),
      );
    }

    // Fetch recipe.json from the repo
    const recipe = await registryFetcher.fetchRecipeFromRepo(
      spec.owner,
      spec.repo,
      spec.ref,
      recipePath,
    );

    // deno-lint-ignore no-console
    console.log(
      `  Recipe: ${fmtColors.bold(recipe.name)} — ${recipe.description}`,
    );

    // Determine target directory
    let targetDir = Deno.cwd();

    if (projectName !== undefined) {
      targetDir = `${Deno.cwd()}/${projectName}`;
      try {
        await Deno.mkdir(targetDir, { recursive: true });
      } catch {
        // deno-lint-ignore no-console
        console.error(
          fmtColors.red(`Could not create directory: ${targetDir}`),
        );
        return results.fail({ exitCode: 1 });
      }
    }

    // Inject project_name variable if --name is set
    if (
      projectName !== undefined && variables["project_name"] === undefined
    ) {
      variables["project_name"] = projectName;
    }

    // Build the registry URL (raw GitHub content for this repo/ref)
    const registryUrl =
      `https://raw.githubusercontent.com/${spec.owner}/${spec.repo}/${spec.ref}`;

    // Apply the recipe
    if (dryRun) {
      // deno-lint-ignore no-console
      console.log(fmtColors.dim("\n  Dry run — no files will be written\n"));
    }

    const result = await recipeApplier.applyRecipe(recipe, {
      cwd: targetDir,
      registryUrl,
      force,
      skipExisting,
      dryRun,
      verbose,
      variables,
    });

    // Summary
    const verb = dryRun ? "Would write" : "Cloned";
    // deno-lint-ignore no-console
    console.log(
      fmtColors.green(
        `\n✓ ${verb} ${result.written.length} file(s) from ${recipe.name}`,
      ),
    );

    if (result.skipped.length > 0) {
      // deno-lint-ignore no-console
      console.log(
        fmtColors.dim(`  Skipped ${result.skipped.length} existing file(s)`),
      );
    }

    for (const file of result.written) {
      // deno-lint-ignore no-console
      console.log(`  → ${file}`);
    }

    // Post-install results
    if (result.postInstallRan.length > 0) {
      // deno-lint-ignore no-console
      console.log(fmtColors.dim("\nPost-install:"));
      for (const cmd of result.postInstallRan) {
        // deno-lint-ignore no-console
        console.log(fmtColors.dim(`  ✓ ${cmd}`));
      }
    }

    // Dependency instructions
    const project = await dependencyResolver.detectProjectType(targetDir);
    const depInfo = dependencyResolver.getDependencyInstructions(
      recipe,
      project,
    );

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

export { parseSpecifier };

export type { ParsedSpecifier };
