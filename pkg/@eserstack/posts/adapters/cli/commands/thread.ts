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
import * as threadPostError from "../../../application/thread-post-error.ts";
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
    // The message says where the thread stopped and why; the posts that went
    // out follow it, so their IDs are at hand to continue the thread.
    await output.outputError(error.message);
    if (
      error instanceof threadPostError.ThreadPartialError &&
      error.postedTweets.length > 0
    ) {
      await output.outputPosts(error.postedTweets);
    }
    return results.fail({ exitCode: 1 });
  }
  await output.outputPosts(postsResult.value);
  return results.ok(undefined);
};
