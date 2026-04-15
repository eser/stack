// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts thread <text1> <text2> ... [--platform=<platform>]`
 *
 * Each positional argument is one post in the thread.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as task from "@eserstack/functions/task";
import type * as shellArgs from "@eserstack/shell/args";
import type { Platform } from "../../../domain/values/platform.ts";
import { ThreadPartialError } from "../../../application/thread-post-error.ts";
import * as wiring from "../wiring.ts";
import * as output from "../output.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  let platform: Platform | undefined;
  const texts: string[] = [];

  for (const arg of args ?? []) {
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    } else if (!arg.startsWith("--")) {
      texts.push(arg);
    }
  }

  if (texts.length < 2) {
    await output.outputError(
      "Usage: eser posts thread <text1> <text2> [...] [--platform=<platform>] (minimum 2 posts)",
    );
    return results.fail({ exitCode: 1 });
  }

  const { cliTriggers } = await wiring.createAppContext();

  const postsResult = await task.runTask(
    cliTriggers.postThread({ texts, platform }),
  );
  if (results.isFail(postsResult)) {
    const error = postsResult.error;
    if (error instanceof ThreadPartialError) {
      await output.outputError(
        `Thread partially posted: ${error.postedTweets.length}/${error.totalCount} succeeded`,
      );
      if (error.postedTweets.length > 0) {
        await output.outputPosts(error.postedTweets);
      }
      await output.outputError(
        `Failed at index ${error.failedIndex}: ${error.failureCause.message}`,
      );
    } else {
      await output.outputError(error.message);
    }
    return results.fail({ exitCode: 1 });
  }
  await output.outputPosts(postsResult.value);
  return results.ok(undefined);
};
