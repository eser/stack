// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux init command
 *
 * Creates a new laroux.js project from a registry recipe or
 * a remote GitHub template via the clone mechanism.
 *
 * @module
 */

import * as shellArgs from "@eser/shell/args";
import * as span from "@eser/streams/span";
import * as streams from "@eser/streams";
import * as results from "@eser/primitives/results";

const TEMPLATES = ["minimal", "blog", "dashboard", "docs"] as const;
type TemplateName = (typeof TEMPLATES)[number];

export const main = async (
  args?: readonly string[],
): Promise<results.Result<void, { message?: string; exitCode: number }>> => {
  const { positional, flags } = shellArgs.parseFlags(args ?? [], [
    {
      name: "template",
      short: "t",
      type: "string",
      default: "minimal",
      description: "Project template",
    },
    { name: "force", short: "f", type: "boolean", description: "Overwrite" },
    { name: "no-git", type: "boolean", description: "Skip git" },
    { name: "no-install", type: "boolean", description: "Skip install" },
  ]);

  const folder = (positional[0] as string) ?? "my-laroux-app";
  const templateName = flags["template"] as string;
  const force = flags["force"] as boolean;
  const noGit = flags["no-git"] as boolean;

  const renderer = streams.renderers.ansi();
  const out = streams.output({
    renderer,
    sink: streams.sinks.stdout(),
  });

  // Validate template
  if (!TEMPLATES.includes(templateName as TemplateName)) {
    await out.close();
    return results.fail({
      message: `${
        renderer.render([
          span.red(`\nError: Invalid template "${templateName}"`),
        ])
      }\n` +
        `Available templates: ${TEMPLATES.join(", ")}`,
      exitCode: 1,
    });
  }

  out.writeln(
    span.cyan(`\n✨ Creating new laroux.js project in ./${folder}\n`),
  );
  out.writeln(span.dim(`   Template: ${templateName}`));

  const specOwner = "eser";
  const specRepo = `laroux-template-${templateName}`;
  const specRef = "main";

  // Create target directory
  const targetDir = `${Deno.cwd()}/${folder}`;
  try {
    await Deno.mkdir(targetDir, { recursive: true });
  } catch {
    await out.close();
    return results.fail({
      message: renderer.render([
        span.red(`\nCould not create directory: ${targetDir}`),
      ]),
      exitCode: 1,
    });
  }

  out.writeln(
    span.dim(`   Fetching from gh:${specOwner}/${specRepo}...\n`),
  );

  try {
    const registryFetcher = await import("@eser/registry/fetcher");
    const recipeApplier = await import("@eser/registry/applier");

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
      const repoUrl =
        `https://raw.githubusercontent.com/${specOwner}/${specRepo}/${specRef}`;

      const result = await recipeApplier.applyRecipe(recipe.value, {
        cwd: targetDir,
        registryUrl: repoUrl,
        force,
        variables: { project_name: folder },
      });

      out.writeln(span.green(`\n🎉 Project created successfully!`));
      out.writeln(
        span.dim(`   ${result.written.length} files written`),
      );
    } else {
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
        await out.close();
        return results.fail({
          message: renderer.render([
            span.red(
              `\nScaffolding failed: ${scaffoldResult.error.message}`,
            ),
          ]),
          exitCode: 1,
        });
      }

      const result = scaffoldResult.value;
      out.writeln(span.green(`\n🎉 Project created successfully!`));

      if (Object.keys(result.variables).length > 0) {
        out.writeln(span.text("\nVariables applied:"));
        for (const [key, value] of Object.entries(result.variables)) {
          out.writeln(
            span.text("  "),
            span.dim(key),
            span.text(`: ${value}`),
          );
        }
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await out.close();
    return results.fail({
      message: renderer.render([span.red(`\nFailed: ${msg}`)]),
      exitCode: 1,
    });
  }

  out.writeln();
  out.writeln(span.bold("Next steps:"));
  out.writeln();
  out.writeln(span.text(`  cd ${folder}`));
  out.writeln(span.text("  laroux dev"));
  out.writeln();
  out.writeln(
    span.text("Then open "),
    span.cyan("http://localhost:8000"),
    span.text(" in your browser."),
  );
  out.writeln();
  out.writeln(span.dim("Learn more at https://laroux.now/"));
  out.writeln();

  await out.close();
  return results.ok(undefined);
};
