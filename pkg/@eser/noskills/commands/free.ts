// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills free` — Deprecated. IDLE is the default permissive state.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import { cmd } from "../output/cmd.ts";

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(
    span.dim(
      "noskills starts in idle mode with no enforcement. To work on a spec, run:",
    ),
  );
  out.writeln(span.bold(`  ${cmd('spec new "description"')}`));
  await out.close();

  return results.ok(undefined);
};
