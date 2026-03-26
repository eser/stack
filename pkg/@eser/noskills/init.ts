// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Initialize noskills — placeholder module.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";

export const main = async (
  _args?: readonly string[],
): Promise<results.Result<void, { message?: string; exitCode: number }>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln("coming soon...");
  await out.close();
  return results.ok(undefined);
};
