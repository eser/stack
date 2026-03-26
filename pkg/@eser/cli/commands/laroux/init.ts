// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux init command handler
 *
 * Creates a new laroux.js project from a registry recipe or
 * a remote GitHub template via the clone mechanism.
 *
 * @module
 */

import * as fmtColors from "@eser/shell/formatting/colors";
import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as registryFetcher from "@eser/registry/fetcher";
import * as recipeApplier from "@eser/registry/applier";

const TEMPLATES = ["minimal", "blog", "dashboard", "docs"] as const;
type TemplateName = typeof TEMPLATES[number];

export const initHandler = async (
  ctx: shellArgs.CommandContext,
): Promise<shellArgs.CliResult<void>> => {
  // Get folder name from args (first positional argument)
  const folder = (ctx.args[0] as string) ?? "my-laroux-app";

  // Get template from flags
  const templateName = (ctx.flags["template"] as string) ?? "minimal";

  // Validate template
  if (!TEMPLATES.includes(templateName as TemplateName)) {
    return results.fail({
      message:
        `${fmtColors.red(`\nError: Invalid template "${templateName}"`)}\n` +
        `Available templates: ${TEMPLATES.join(", ")}`,
      exitCode: 1,
    });
  }

  // deno-lint-ignore no-console
  console.log(
    fmtColors.cyan(`\n✨ Creating new laroux.js project in ./${folder}\n`),
  );
  // deno-lint-ignore no-console
  console.log(fmtColors.dim(`   Template: ${templateName}`));

  // Try the registry first (for the "laroux-app" recipe if it matches "minimal")
  // Fall back to GitHub clone for specific templates
  const specOwner = "eser";
  const specRepo = `laroux-template-${templateName}`;
  const specRef = "main";

  const force = (ctx.flags["force"] as boolean) ?? false;
  const noGit = (ctx.flags["no-git"] as boolean) ?? false;

  // Create target directory
  const targetDir = `${Deno.cwd()}/${folder}`;
  try {
    await Deno.mkdir(targetDir, { recursive: true });
  } catch {
    return results.fail({
      message: fmtColors.red(`\nCould not create directory: ${targetDir}`),
      exitCode: 1,
    });
  }

  // deno-lint-ignore no-console
  console.log(
    fmtColors.dim(`   Fetching from gh:${specOwner}/${specRepo}...\n`),
  );

  try {
    // Try to fetch recipe.json from the template repo
    const recipe = await results.tryCatchAsync(
      () =>
        registryFetcher.fetchRecipeFromRepo(
          specOwner,
          specRepo,
          specRef,
          "recipe.json",
        ),
      () => undefined,
    );

    if (recipe._tag === "Ok" && recipe.value !== undefined) {
      // Recipe found — use the structured recipe applier
      const repoUrl =
        `https://raw.githubusercontent.com/${specOwner}/${specRepo}/${specRef}`;

      const result = await recipeApplier.applyRecipe(recipe.value, {
        cwd: targetDir,
        registryUrl: repoUrl,
        force,
        variables: { project_name: folder },
      });

      // deno-lint-ignore no-console
      console.log(fmtColors.green(`\n🎉 Project created successfully!`));
      // deno-lint-ignore no-console
      console.log(
        fmtColors.dim(`   ${result.written.length} files written`),
      );
    } else {
      // No recipe.json — fall back to the legacy scaffolding system
      const scaffolding = await import("@eser/codebase/scaffolding");
      const specifier = `gh:${specOwner}/${specRepo}`;

      const scaffoldResult = await results.tryCatchAsync(
        () =>
          scaffolding.scaffold({
            specifier,
            targetDir: folder,
            force,
            skipPostInstall: noGit,
            interactive: true,
          }),
        (error) => ({ message: (error as Error).message }),
      );

      if (scaffoldResult._tag === "Fail") {
        return results.fail({
          message: fmtColors.red(
            `\nScaffolding failed: ${scaffoldResult.error.message}`,
          ),
          exitCode: 1,
        });
      }

      const result = scaffoldResult.value;

      // deno-lint-ignore no-console
      console.log(fmtColors.green(`\n🎉 Project created successfully!`));

      if (Object.keys(result.variables).length > 0) {
        // deno-lint-ignore no-console
        console.log("\nVariables applied:");
        for (const [key, value] of Object.entries(result.variables)) {
          // deno-lint-ignore no-console
          console.log(`  ${fmtColors.dim(key)}: ${value}`);
        }
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return results.fail({
      message: fmtColors.red(`\nFailed: ${msg}`),
      exitCode: 1,
    });
  }

  // Print next steps
  // deno-lint-ignore no-console
  console.log(`
${fmtColors.bold("Next steps:")}

  cd ${folder}
  eser laroux dev

Then open ${fmtColors.cyan("http://localhost:8000")} in your browser.

${fmtColors.dim("Learn more at https://laroux.now/")}
`);

  return results.ok(undefined);
};
