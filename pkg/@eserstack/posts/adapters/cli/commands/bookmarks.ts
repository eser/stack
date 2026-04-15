// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts bookmarks --platform=<platform> [--max=<n>]`
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
  let maxResults: number | undefined;

  for (const arg of args ?? []) {
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    } else if (arg.startsWith("--max=")) {
      const n = parseInt(arg.slice("--max=".length), 10);
      if (!isNaN(n) && n > 0) maxResults = n;
    }
  }

  if (platform === undefined) {
    await output.outputError(
      "Usage: eser posts bookmarks --platform=<platform> [--max=<n>]",
    );
    return results.fail({ exitCode: 1 });
  }

  const { cliTriggers } = await wiring.createAppContext();

  const postsResult = await task.runTask(
    cliTriggers.getBookmarks({ platform, maxResults }),
  );
  if (results.isFail(postsResult)) {
    await output.outputError(postsResult.error.message);
    return results.fail({ exitCode: 1 });
  }
  await output.outputPosts(postsResult.value);
  return results.ok(undefined);
};
