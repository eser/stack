// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts quote <post-id> --text=<commentary> --platform=<platform>`
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
  let postIdArg: string | undefined;
  let text: string | undefined;

  for (const arg of args ?? []) {
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    } else if (arg.startsWith("--text=")) {
      text = arg.slice("--text=".length);
    } else if (!arg.startsWith("--")) {
      postIdArg = arg;
    }
  }

  if (postIdArg === undefined || text === undefined || platform === undefined) {
    await output.outputError(
      'Usage: eser posts quote <post-id> --text="<commentary>" --platform=<platform>',
    );
    return results.fail({ exitCode: 1 });
  }

  const { cliTriggers } = await wiring.createAppContext();

  const postResult = await task.runTask(
    cliTriggers.quotePost({ rawText: text, postId: postIdArg, platform }),
  );
  if (results.isFail(postResult)) {
    await output.outputError(postResult.error.message);
    return results.fail({ exitCode: 1 });
  }
  await output.outputPost(postResult.value);
  return results.ok(undefined);
};
