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
import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as specUpdater from "../spec/updater.ts";
import * as identity from "../state/identity.ts";
import { cmd } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
  const specResult = persistence.requireSpecFlag(args);
  if (!specResult.ok) {
    out.writeln(span.red(specResult.error));
    await out.close();
    return results.fail({ exitCode: 1 });
  }
  let state: schema.StateFile;
  try {
    state = await persistence.resolveState(root, specResult.spec);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(msg));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

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
      out.writeln(span.dim("Run `noskills reset` to return to idle."));
      await out.close();
      return results.fail({ exitCode: 1 });
    }
  }

  const user = await identity.resolveUser(root);
  let completedState = machine.completeSpec(state, "done");
  completedState = machine.recordTransition(
    completedState,
    "EXECUTING",
    "COMPLETED",
    user,
  );

  // Per-spec: preserve COMPLETED state for history
  if (completedState.spec !== null) {
    await persistence.writeSpecState(root, completedState.spec, completedState);
  }

  // Global: return to IDLE
  const idleState = machine.resetToIdle(completedState);
  await persistence.writeState(root, idleState);

  // Update spec.md: "executing" → "completed"
  if (completedState.spec !== null) {
    await specUpdater.updateSpecStatus(root, completedState.spec, "completed");
    await specUpdater.updateProgressStatus(
      root,
      completedState.spec,
      "completed",
    );
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
