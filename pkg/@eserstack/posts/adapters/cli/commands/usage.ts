// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `eser posts usage [--platform=<platform>]`
 *
 * Prints API usage data (daily call counts, totals) for the given platform.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as task from "@eserstack/functions/task";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import type { Platform } from "../../../domain/values/platform.ts";
import * as wiring from "../wiring.ts";
import * as output from "../output.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  let platform: Platform | undefined;

  for (const arg of args ?? []) {
    if (arg.startsWith("--platform=")) {
      platform = arg.slice("--platform=".length) as Platform;
    }
  }

  const { cliTriggers } = await wiring.createAppContext();

  const usageResult = await task.runTask(
    cliTriggers.getUsage({ platform }),
  );
  if (results.isFail(usageResult)) {
    await output.outputError(usageResult.error.message);
    return results.fail({ exitCode: 1 });
  }

  const usage = usageResult.value;
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.bold("API Usage"));
  if (usage.appName !== undefined) {
    out.writeln("  App:         ", span.dim(usage.appName));
  }
  out.writeln("  Total calls: ", span.bold(String(usage.totalCalls)));
  out.writeln("");

  if (usage.daily.length > 0) {
    out.writeln(span.bold("  Daily breakdown:"));
    for (const day of usage.daily) {
      out.writeln(
        "    ",
        span.dim(day.date.toISOString().slice(0, 10)),
        "  ",
        String(day.callCount),
        " calls",
      );
    }
  }

  await out.close();
  return results.ok(undefined);
};
