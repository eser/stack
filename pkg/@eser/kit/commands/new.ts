// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * New command — CLI adapter for the new-project handler.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as task from "@eser/functions/task";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import * as newProjectHandler from "../recipes/handlers/new-project.ts";
import * as registryFetcher from "../recipes/registry-fetcher.ts";
import type * as shellArgs from "@eser/shell/args";

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

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  // Parse --var flags
  const variables: Record<string, string> = {};
  for (const v of (parsed["var"] as string[])) {
    const [key, ...valueParts] = String(v).split("=");
    if (key !== undefined && key !== "") {
      variables[key] = valueParts.join("=");
    }
  }

  // No template → show available templates
  if (templateName === undefined) {
    try {
      const manifest = await registryFetcher.fetchRegistry(registryUrl, {
        local,
      });
      const templates = manifest.recipes.filter((r) => r.scale === "project");

      out.writeln(
        "Usage: eser kit new <template> [--name <project-name>] [--var key=value]",
      );
      out.writeln();
      out.writeln("Available project templates:");
      out.writeln();

      for (const tmpl of templates) {
        out.writeln(
          `  ${tmpl.name.padEnd(20)} ${tmpl.description} `,
          span.dim(`[${tmpl.language}]`),
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      out.writeln(span.red(`Error: ${msg}`));
    }

    await out.close();
    return results.ok(undefined);
  }

  if (projectName === undefined) {
    out.writeln(span.red("Project name is required."));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  out.writeln(
    span.cyan(`\nCreating ${projectName} from ${templateName}...\n`),
  );

  const targetDir = `${Deno.cwd()}/${projectName}`;

  const handlerResult = await task.runTask(
    newProjectHandler.newProject({
      templateName,
      projectName,
      targetDir,
      registrySource: registryUrl,
      local,
      variables,
    }),
    { out },
  );

  await out.close();

  if (results.isOk(handlerResult)) {
    return results.ok(undefined);
  }

  return results.fail({ exitCode: 1 });
};
