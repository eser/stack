// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Add command — CLI adapter for the add-recipe handler.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as results from "@eserstack/primitives/results";
import * as shellFlags from "@eserstack/shell/args/flags";
import * as task from "@eserstack/functions/task";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import * as addRecipeHandler from "../recipes/handlers/add-recipe.ts";
import type * as shellArgs from "@eserstack/shell/args";

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

/** Parse the `eser kit add` arguments. */
export const parseCliArgs = (
  cliArgs?: readonly string[],
): shellFlags.ParsedArgs =>
  shellFlags.parseArgs(cliArgs ?? [], {
    options: {
      registry: { type: "string" },
      var: { type: "string", multiple: true, default: [] },
      cwd: { type: "string" },
      "dry-run": { type: "boolean" },
      force: { type: "boolean" },
      "skip-existing": { type: "boolean" },
      verbose: { type: "boolean" },
      local: { type: "boolean" },
      "no-install": { type: "boolean" },
    },
  });

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = parseCliArgs(cliArgs);

  const recipeName = parsed.positionals[0];
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  if (recipeName === undefined) {
    out.writeln(
      "Usage: eser kit add <recipe> [--registry <url>] [--dry-run] [--var key=value]",
    );
    out.writeln();
    out.writeln(
      "Run ",
      span.dim("`eser kit list`"),
      " to see available recipes.",
    );
    await out.close();
    return results.ok(undefined);
  }

  const dryRun = parsed.values["dry-run"] === true;

  if (dryRun) {
    out.writeln(span.cyan(`\nDry run: ${recipeName}\n`));
  } else {
    out.writeln(span.cyan(`\nAdding ${recipeName}...\n`));
  }

  const result = await task.runTask(
    addRecipeHandler.addRecipe({
      recipeName,
      // --cwd overrides the process directory.
      //
      // Tests used to chdir into a temp directory instead, which is
      // process-global, so that changed the cwd of every other test running
      // concurrently in the process and then deleted the directory on the way
      // out. Unrelated suites failed with reproducible-but-baffling errors
      // roughly one run in four.
      cwd:
        (parsed.values["cwd"] as string | undefined) ?? runtime.process.cwd(),
      registrySource: parsed.values["registry"] as string | undefined,
      local: parsed.values["local"] === true,
      dryRun,
      force: parsed.values["force"] === true,
      skipExisting: parsed.values["skip-existing"] === true,
      verbose: parsed.values["verbose"] === true,
      noInstall: parsed.values["no-install"] === true,
      variables: parseVarFlags(parsed.values["var"] as string[]),
    }),
    { out },
  );

  await out.close();

  if (results.isOk(result)) {
    return results.ok(undefined);
  }

  return results.fail({ message: result.error.message, exitCode: 1 });
};
