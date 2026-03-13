// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux init command handler
 *
 * Creates a new laroux.js project from template using scaffolding
 *
 * @module
 */

import * as fmtColors from "@eser/shell/formatting/colors";
import * as results from "@eser/primitives/results";
import * as shellArgs from "@eser/shell/args";
import * as scaffolding from "@eser/codebase/scaffolding";

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

  // Build the GitHub specifier for the template
  // Templates are hosted at gh:eser/laroux-template-{name}
  const specifier = `gh:eser/laroux-template-${templateName}`;

  // Get other flags
  const force = (ctx.flags["force"] as boolean) ?? false;
  const skipPostInstall = (ctx.flags["no-install"] as boolean) ?? false;
  const noGit = (ctx.flags["no-git"] as boolean) ?? false;

  // deno-lint-ignore no-console
  console.log(fmtColors.dim(`   Fetching from ${specifier}...\n`));

  const scaffoldResult = await results.tryCatchAsync(
    () =>
      scaffolding.scaffold({
        specifier,
        targetDir: folder,
        force,
        skipPostInstall: skipPostInstall || noGit, // Skip git init if --no-git
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

  // Show applied variables if any
  if (Object.keys(result.variables).length > 0) {
    // deno-lint-ignore no-console
    console.log("\nVariables applied:");
    for (const [key, value] of Object.entries(result.variables)) {
      // deno-lint-ignore no-console
      console.log(`  ${fmtColors.dim(key)}: ${value}`);
    }
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
