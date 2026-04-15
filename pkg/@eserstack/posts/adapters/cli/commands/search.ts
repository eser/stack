// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts search <query> [--platform=<platform>] [--max=<n>]`
 *
 * When --platform is omitted, searches all authenticated platforms and merges results.
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
  let query: string | undefined;

  for (const arg of args ?? []) {
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    } else if (arg.startsWith("--max=")) {
      const n = parseInt(arg.slice("--max=".length), 10);
      if (!isNaN(n) && n > 0) maxResults = n;
    } else if (!arg.startsWith("--")) {
      query = arg;
    }
  }

  if (query === undefined || query.trim().length === 0) {
    await output.outputError(
      "Usage: eser posts search <query> [--platform=<platform>] [--max=<n>]",
    );
    return results.fail({ exitCode: 1 });
  }

  const { cliTriggers } = await wiring.createAppContext();

  const postsResult = platform !== undefined
    ? await task.runTask(
      cliTriggers.searchPosts({ rawText: query.trim(), platform, maxResults }),
    )
    : await task.runTask(
      cliTriggers.searchPostsAll({ rawText: query.trim(), maxResults }),
    );

  if (results.isFail(postsResult)) {
    await output.outputError(postsResult.error.message);
    return results.fail({ exitCode: 1 });
  }
  await output.outputPosts(postsResult.value);
  return results.ok(undefined);
};
