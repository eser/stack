// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * New command — scaffold a new project from a registry template.
 *
 * Filters the registry to `scale: "project"` recipes only and
 * creates a new project directory.
 *
 * Usage:
 *   eser kit new <template> [--name <project-name>] [--registry <url>]
 *                              [--var key=value ...] [--local]
 *   eser kit create <template>  (alias)
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

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["name", "registry", "var"],
    boolean: ["local"],
    collect: ["var"],
  });

  const templateName = parsed._[0] as string | undefined;
  const projectName = (parsed["name"] as string | undefined) ??
    (templateName as string | undefined);
  const registryUrl = parsed["registry"] as string | undefined;
  const local = parsed["local"] === true;

  // Parse --var flags
  const variables: Record<string, string> = {};
  for (const v of (parsed["var"] as string[])) {
    const [key, ...valueParts] = String(v).split("=");
    if (key !== undefined && key !== "") {
      variables[key] = valueParts.join("=");
    }
  }

  // Inject project_name variable if --name is set and not already in --var
  if (projectName !== undefined && variables["project_name"] === undefined) {
    variables["project_name"] = projectName;
  }

  try {
    const manifest = await registryFetcher.fetchRegistry(registryUrl, {
      local,
    });

    // Filter to project-scale recipes only
    const templates = manifest.recipes.filter((r) => r.scale === "project");

    if (templateName === undefined) {
      // deno-lint-ignore no-console
      console.log(
        "Usage: eser kit new <template> [--name <project-name>] [--var key=value]\n",
      );
      // deno-lint-ignore no-console
      console.log("Available project templates:\n");

      for (const tmpl of templates) {
        const lang = fmtColors.dim(`[${tmpl.language}]`);
        // deno-lint-ignore no-console
        console.log(`  ${tmpl.name.padEnd(20)} ${tmpl.description} ${lang}`);
      }

      return results.ok(undefined);
    }

    // Find template
    const template = templates.find((r) => r.name === templateName);

    if (template === undefined) {
      // deno-lint-ignore no-console
      console.error(
        fmtColors.red(
          `Template '${templateName}' not found. Run \`eser kit new\` to see available templates.`,
        ),
      );
      return results.fail({ exitCode: 1 });
    }

    if (projectName === undefined) {
      // deno-lint-ignore no-console
      console.error(fmtColors.red("Project name is required."));
      return results.fail({ exitCode: 1 });
    }

    // Create project directory
    const targetDir = `${Deno.cwd()}/${projectName}`;

    try {
      await Deno.mkdir(targetDir, { recursive: true });
    } catch {
      // deno-lint-ignore no-console
      console.error(
        fmtColors.red(`Could not create directory: ${targetDir}`),
      );
      return results.fail({ exitCode: 1 });
    }

    // deno-lint-ignore no-console
    console.log(
      fmtColors.cyan(`\nCreating ${projectName} from ${template.name}...\n`),
    );

    // Apply template files with variables
    const result = await recipeApplier.applyRecipe(template, {
      cwd: targetDir,
      registryUrl: manifest.registryUrl,
      force: true,
      variables,
    });

    // Summary
    // deno-lint-ignore no-console
    console.log(
      fmtColors.green(
        `\n✓ Created ${projectName} with ${result.written.length} file(s)`,
      ),
    );

    for (const file of result.written) {
      // deno-lint-ignore no-console
      console.log(`  → ${file}`);
    }

    // Post-install results
    if (result.postInstallRan.length > 0) {
      // deno-lint-ignore no-console
      console.log(fmtColors.dim("\nPost-install commands ran:"));
      for (const cmd of result.postInstallRan) {
        // deno-lint-ignore no-console
        console.log(fmtColors.dim(`  ✓ ${cmd}`));
      }
    }

    // Dependency instructions
    const project = await dependencyResolver.detectProjectType(targetDir);
    const depInfo = dependencyResolver.getDependencyInstructions(
      template,
      project,
    );

    if (depInfo.instructions.length > 0) {
      // deno-lint-ignore no-console
      console.log(fmtColors.dim("\nNext steps:"));
      // deno-lint-ignore no-console
      console.log(fmtColors.dim(`  cd ${projectName}`));
      for (const instruction of depInfo.instructions) {
        // deno-lint-ignore no-console
        console.log(fmtColors.dim(`  ${instruction}`));
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
