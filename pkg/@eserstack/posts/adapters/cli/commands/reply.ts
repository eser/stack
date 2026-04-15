// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts reply --to=<post-id> <text> [--platform=<platform>]`
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
  let toPostId: string | undefined;
  let platform: Platform | undefined;
  const textParts: string[] = [];

  for (const arg of args ?? []) {
    if (arg.startsWith("--to=")) {
      toPostId = arg.slice("--to=".length);
    } else if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    } else if (!arg.startsWith("--")) {
      textParts.push(arg);
    }
  }

  const text = textParts.join(" ").trim();

  if (text.length === 0 || toPostId === undefined) {
    await output.outputError(
      "Usage: eser posts reply --to=<post-id> <text> [--platform=<platform>]",
    );
    return results.fail({ exitCode: 1 });
  }

  const { cliTriggers } = await wiring.createAppContext();
  const resolvedPlatform: Platform = platform ?? "twitter";

  const postResult = await task.runTask(
    cliTriggers.reply({
      rawText: text,
      postId: toPostId,
      platform: resolvedPlatform,
    }),
  );

  if (results.isFail(postResult)) {
    await output.outputError(postResult.error.message);
    return results.fail({ exitCode: 1 });
  }
  await output.outputPost(postResult.value);
  return results.ok(undefined);
};
