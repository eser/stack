// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills done` — Mark current spec execution as complete.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as specUpdater from "../spec/updater.ts";
import { cmd } from "../output/cmd.ts";
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

  if (state.phase !== "EXECUTING") {
    out.writeln(span.red(`Cannot complete in phase: ${state.phase}`));
    out.writeln(
      span.dim("Only EXECUTING phase can transition to DONE."),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const newState = machine.transition(state, "DONE");
  await persistence.writeState(root, newState);

  // Update spec.md: "executing" → "done"
  if (newState.spec !== null) {
    await specUpdater.updateSpecStatus(root, newState.spec, "done");
    await specUpdater.updateProgressStatus(root, newState.spec, "done");
  }

  out.writeln(span.green("✔"), " Spec completed!");
  out.writeln("");
  out.writeln("  Spec:       ", span.bold(state.spec ?? "unknown"));
  out.writeln(`  Iterations: ${state.execution.iteration}`);
  out.writeln(`  Decisions:  ${state.decisions.length}`);

  if (state.decisions.length > 0) {
    const promoted = state.decisions.filter((d) => d.promoted);
    if (promoted.length > 0) {
      out.writeln(
        span.dim(`  Promoted to rules: ${promoted.length}`),
      );
    }
  }

  out.writeln("");
  out.writeln(
    "Start a new spec with: ",
    span.bold(`${cmd('spec new "..."')}`),
  );
  await out.close();

  return results.ok(undefined);
};
