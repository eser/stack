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
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const specFlag = persistence.parseSpecFlag(args);
  const state = await persistence.resolveState(root, specFlag);

  if (state.phase !== "EXECUTING") {
    out.writeln(span.red(`Cannot complete in phase: ${state.phase}`));
    out.writeln(
      span.dim("Only EXECUTING phase can transition to COMPLETED."),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // State integrity check: verify active spec directory exists
  if (state.spec !== null) {
    const specDir = `${root}/${persistence.paths.specDir(state.spec)}`;
    try {
      await runtime.fs.stat(specDir);
    } catch {
      out.writeln(span.red(`Active spec '${state.spec}' directory not found.`));
      out.writeln(span.dim("Run `noskills reset` to return to IDLE."));
      await out.close();
      return results.fail({ exitCode: 1 });
    }
  }

  const newState = machine.completeSpec(state, "done");
  await persistence.writeState(root, newState);

  // Update spec.md: "executing" → "completed"
  if (newState.spec !== null) {
    await specUpdater.updateSpecStatus(root, newState.spec, "completed");
    await specUpdater.updateProgressStatus(root, newState.spec, "completed");
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
