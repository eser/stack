// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts timeline [--platform=<platform>] [--max=<n>] [--unified]`
 *
 * --unified  Merge timelines from all authenticated platforms (sorted newest-first).
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
  let maxResults = 10;
  let unified = false;

  for (const arg of args ?? []) {
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    } else if (arg.startsWith("--max=")) {
      const parsed = parseInt(arg.slice("--max=".length), 10);
      if (!isNaN(parsed)) maxResults = parsed;
    } else if (arg === "--unified") {
      unified = true;
    }
  }

  const { cliTriggers } = await wiring.createAppContext();

  const postsResult = unified
    ? await task.runTask(cliTriggers.getUnifiedTimeline({ maxResults }))
    : await task.runTask(cliTriggers.getTimeline({ platform, maxResults }));

  if (results.isFail(postsResult)) {
    await output.outputError(postsResult.error.message);
    return results.fail({ exitCode: 1 });
  }
  await output.outputPosts(postsResult.value);
  return results.ok(undefined);
};
