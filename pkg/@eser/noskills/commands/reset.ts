// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills reset` — Reset current spec state to IDLE.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const state = await persistence.readState(root);

  if (state.phase === "IDLE" || state.phase === "UNINITIALIZED") {
    out.writeln(span.dim("Already idle. Nothing to reset."));
    await out.close();

    return results.ok(undefined);
  }

  const specName = state.spec;
  const newState = machine.resetToIdle(state);
  await persistence.writeState(root, newState);

  out.writeln(span.green("✔"), " Reset to IDLE.");
  if (specName !== null) {
    out.writeln(
      span.dim(
        `Spec "${specName}" state cleared. Files in .eser/specs/${specName}/ preserved.`,
      ),
    );
  }
  await out.close();

  return results.ok(undefined);
};
