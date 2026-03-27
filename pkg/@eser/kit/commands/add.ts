// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Add command — CLI adapter for the add-recipe handler.
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";
import * as results from "@eser/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as task from "@eser/functions/task";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import * as addRecipeHandler from "../recipes/handlers/add-recipe.ts";
import type * as shellArgs from "@eser/shell/args";

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

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["registry", "var"],
    boolean: [
      "dry-run",
      "force",
      "skip-existing",
      "verbose",
      "local",
      "no-install",
    ],
    collect: ["var"],
  });

  const recipeName = parsed._[0] as string | undefined;
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

  const dryRun = parsed["dry-run"] === true;

  if (dryRun) {
    out.writeln(span.cyan(`\nDry run: ${recipeName}\n`));
  } else {
    out.writeln(span.cyan(`\nAdding ${recipeName}...\n`));
  }

  const result = await task.runTask(
    addRecipeHandler.addRecipe({
      recipeName,
      cwd: runtime.process.cwd(),
      registrySource: parsed["registry"] as string | undefined,
      local: parsed["local"] === true,
      dryRun,
      force: parsed["force"] === true,
      skipExisting: parsed["skip-existing"] === true,
      verbose: parsed["verbose"] === true,
      noInstall: parsed["no-install"] === true,
      variables: parseVarFlags(parsed["var"] as string[]),
    }),
    { out },
  );

  await out.close();

  if (results.isOk(result)) {
    return results.ok(undefined);
  }

  return results.fail({ exitCode: 1 });
};
