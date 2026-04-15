// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts compose <text> [--platform=<platform>]`
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as task from "@eserstack/functions/task";
import type * as shellArgs from "@eserstack/shell/args";
import type { Platform } from "../../../domain/values/platform.ts";
import * as wiring from "../wiring.ts";
import * as output from "../output.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  let platform: Platform | undefined;
  const textParts: string[] = [];

  for (const arg of args ?? []) {
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    } else if (!arg.startsWith("--")) {
      textParts.push(arg);
    }
  }

  const text = textParts.join(" ").trim();

  if (text.length === 0) {
    await output.outputError(
      "Usage: eser posts compose <text> [--platform=<platform>]",
    );
    return results.fail({ exitCode: 1 });
  }

  const { cliTriggers } = await wiring.createAppContext();

  const postResult = await task.runTask(
    cliTriggers.composeTweet({ rawText: text, platform }),
  );
  if (results.isFail(postResult)) {
    await output.outputError(postResult.error.message);
    return results.fail({ exitCode: 1 });
  }
  await output.outputPost(postResult.value);
  return results.ok(undefined);
};
