// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * List command — CLI adapter for the list-recipes handler.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as task from "@eser/functions/task";
import * as streams from "@eser/streams";
import * as listRecipesHandler from "../recipes/handlers/list-recipes.ts";
import type * as shellArgs from "@eser/shell/args";

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const flags = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["registry", "language", "scale", "tag"],
    boolean: ["local"],
  });

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const result = await task.runTask(
    listRecipesHandler.listRecipes({
      registrySource: flags["registry"] as string | undefined,
      language: flags["language"] as string | undefined,
      scale: flags["scale"] as string | undefined,
      tag: flags["tag"] as string | undefined,
      local: flags["local"] === true,
    }),
    { out },
  );

  await out.close();

  if (results.isOk(result)) {
    return results.ok(undefined);
  }

  return results.fail({ exitCode: 1 });
};
