// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `ai list` — List available AI providers and their status.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import { detectAllProviders } from "../detect.ts";

// =============================================================================
// Main
// =============================================================================

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.bold("AI Providers"));
  out.writeln("");

  const providers = await detectAllProviders();

  const rows = providers.map((p) => [
    p.available ? span.green("●") : span.dim("○"),
    p.available
      ? span.bold(`${p.name} (${p.alias})`)
      : span.dim(`${p.name} (${p.alias})`),
    span.dim(p.type),
    p.available ? p.detail : span.dim(p.detail),
  ]);

  out.writeln(span.table(
    ["", "Provider", "Type", "Status"],
    rows,
  ));

  const availableCount = providers.filter((p) => p.available).length;
  out.writeln(
    span.dim(`${availableCount}/${providers.length} providers available`),
  );

  await out.close();

  return results.ok(undefined);
};
