// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * List command — CLI adapter for the list-recipes handler.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as shellFlags from "@eserstack/shell/args/flags";
import * as task from "@eserstack/functions/task";
import * as streams from "@eserstack/streams";
import * as listRecipesHandler from "../recipes/handlers/list-recipes.ts";
import type * as shellArgs from "@eserstack/shell/args";

/** Parse the `eser kit list` arguments. */
export const parseCliArgs = (
  cliArgs?: readonly string[],
): shellFlags.ParsedArgs =>
  shellFlags.parseArgs(cliArgs ?? [], {
    options: {
      registry: { type: "string" },
      language: { type: "string" },
      scale: { type: "string" },
      tag: { type: "string" },
      local: { type: "boolean" },
    },
  });

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = parseCliArgs(cliArgs);

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const result = await task.runTask(
    listRecipesHandler.listRecipes({
      registrySource: parsed.values["registry"] as string | undefined,
      language: parsed.values["language"] as string | undefined,
      scale: parsed.values["scale"] as string | undefined,
      tag: parsed.values["tag"] as string | undefined,
      local: parsed.values["local"] === true,
    }),
    { out },
  );

  await out.close();

  if (results.isOk(result)) {
    return results.ok(undefined);
  }

  return results.fail({ message: result.error.message, exitCode: 1 });
};
