// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * New command — CLI adapter for the new-project handler.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as shellFlags from "@eserstack/shell/args/flags";
import * as task from "@eserstack/functions/task";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as newProjectHandler from "../recipes/handlers/new-project.ts";
import * as registryFetcher from "../recipes/registry-fetcher.ts";
import * as errorChain from "../recipes/error-chain.ts";
import type * as shellArgs from "@eserstack/shell/args";

/** Parse the `eser kit new` arguments. */
export const parseCliArgs = (
  cliArgs?: readonly string[],
): shellFlags.ParsedArgs =>
  shellFlags.parseArgs(cliArgs ?? [], {
    options: {
      name: { type: "string" },
      registry: { type: "string" },
      var: { type: "string", multiple: true, default: [] },
      local: { type: "boolean" },
      interactive: { type: "boolean", short: "i" },
      "no-interactive": { type: "boolean" },
      "no-post-install": { type: "boolean" },
    },
  });

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = parseCliArgs(cliArgs);

  const templateName = parsed.positionals[0];
  const projectName =
    (parsed.values["name"] as string | undefined) ??
    (templateName as string | undefined);
  const registryUrl = parsed.values["registry"] as string | undefined;
  const local = parsed.values["local"] === true;

  const explicitInteractive = parsed.values["interactive"] === true;
  const noInteractive = parsed.values["no-interactive"] === true;
  const isTty = runtime.process.isTerminal("stdin");
  const interactive = !noInteractive && (explicitInteractive || isTty);

  if (!explicitInteractive && !noInteractive && isTty) {
    // Prompting was turned on automatically; stderr tells the user why.
    // oxlint-disable-next-line no-console
    console.error(
      "Prompting for missing variables (use --no-interactive to disable)",
    );
  }

  const skipPostInstall = parsed.values["no-post-install"] === true;

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  // Parse --var flags
  const variables: Record<string, string> = {};
  for (const v of parsed.values["var"] as string[]) {
    const [key, ...valueParts] = String(v).split("=");
    if (key !== undefined && key !== "") {
      variables[key] = valueParts.join("=");
    }
  }

  // No template → show available templates
  if (templateName === undefined) {
    let manifest: Awaited<ReturnType<typeof registryFetcher.fetchRegistry>>;
    try {
      manifest = await registryFetcher.fetchRegistry(registryUrl, { local });
    } catch (error) {
      await out.close();
      if (!(error instanceof registryFetcher.RegistryLoadError)) {
        throw error;
      }

      return results.fail({
        message: errorChain.formatErrorChain(error),
        exitCode: 1,
      });
    }

    const templates = manifest.recipes.filter((r) => r.scale === "project");

    out.writeln(
      "Usage: eser kit new <template> [--name <project-name>] [--var key=value]",
    );
    out.writeln();
    out.writeln("Available project templates:");
    out.writeln();

    for (const tmpl of templates) {
      out.writeln(
        // Registry strings are third-party content: strip terminal controls.
        span.untrusted(
          `  ${(tmpl.name ?? "").padEnd(20)} ${tmpl.description} `,
        ),
        span.dim(span.untrusted(`[${tmpl.language}]`)),
      );
    }

    await out.close();
    return results.ok(undefined);
  }

  if (projectName === undefined) {
    out.writeln(span.red("Project name is required."));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  out.writeln(span.cyan(`\nCreating ${projectName} from ${templateName}...\n`));

  const targetDir = `${runtime.process.cwd()}/${projectName}`;

  const handlerResult = await task.runTask(
    newProjectHandler.newProject({
      templateName,
      projectName,
      targetDir,
      registrySource: registryUrl,
      local,
      variables,
      interactive,
      skipPostInstall,
    }),
    { out },
  );

  await out.close();

  if (results.isOk(handlerResult)) {
    return results.ok(undefined);
  }

  return results.fail({ message: handlerResult.error.message, exitCode: 1 });
};
