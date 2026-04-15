// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills sync` — Redirects to `noskills init` (merged).
 *
 * @module
 */

import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(
    span.dim("`sync` has been merged into `init`. Running `noskills init`..."),
  );
  out.writeln("");
  await out.close();

  const init = await import("./init.ts");
  return await init.main(args);
};
