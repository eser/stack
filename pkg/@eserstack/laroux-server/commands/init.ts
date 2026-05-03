// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux init command
 *
 * Creates a new laroux.js project from a registry recipe or
 * a remote GitHub template via the clone mechanism.
 *
 * @module
 */

import * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as results from "@eserstack/primitives/results";
import * as task from "@eserstack/functions/task";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as cloneRecipeHandler from "@eserstack/kit/recipes/handlers/clone-recipe";

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

  out.writeln(
    span.dim(`   Fetching from gh:${specOwner}/${specRepo}...\n`),
  );

  const specifierStr = `gh:${specOwner}/${specRepo}`;
  const specifier = cloneRecipeHandler.parseSpecifier(specifierStr);

  if (specifier === undefined) {
    await out.close();
    return results.fail({
      message: renderer.render([
        span.red(`\nCould not parse specifier: ${specifierStr}`),
      ]),
      exitCode: 1,
    });
  }

  const handlerResult = await task.runTask(
    cloneRecipeHandler.cloneRecipe({
      specifier,
      cwd: runtime.process.cwd(),
      projectName: folder,
      force,
      variables: { project_name: folder },
      interactive: true,
      skipPostInstall: noGit,
    }),
    { out },
  );

  if (results.isFail(handlerResult)) {
    const msg = handlerResult.error.message;
    await out.close();
    return results.fail({
      message: renderer.render([span.red(`\nFailed: ${msg}`)]),
      exitCode: 1,
    });
  }

  out.writeln(span.green(`\n🎉 Project created successfully!`));

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
