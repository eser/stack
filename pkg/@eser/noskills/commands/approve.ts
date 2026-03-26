// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills approve` — Human approves phase transition.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = Deno.cwd();
  const state = await persistence.readState(root);

  if (state.phase === "SPEC_DRAFT") {
    const newState = machine.approveSpec(state);
    await persistence.writeState(root, newState);

    out.writeln(
      span.green("✔"),
      " Spec approved. Phase: ",
      span.cyan("BUILDING"),
    );
    out.writeln("Run ", span.bold("noskills next"), " to start building.");
  } else if (state.phase === "DISCOVERY" && state.discovery.completed) {
    // Already completed discovery, move to spec draft
    out.writeln(span.dim("Discovery complete. Spec draft already generated."));
    out.writeln(
      "Review the spec and run ",
      span.bold("noskills approve"),
      " again when in SPEC_DRAFT phase.",
    );
  } else {
    out.writeln(span.red(`Cannot approve in phase: ${state.phase}`));
  }

  await out.close();

  return results.ok(undefined);
};
