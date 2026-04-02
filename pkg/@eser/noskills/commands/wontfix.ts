// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills wontfix "reason"` — Mark spec as won't fix.
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
import * as dashboardEvents from "../dashboard/events.ts";
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
  const filteredArgs = (args ?? []).filter((a) => !a.startsWith("--spec="));
  const reason = filteredArgs.join(" ");

  if (reason.length === 0) {
    out.writeln(
      span.red('A reason is required: noskills wontfix "reason text"'),
    );
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

  if (
    state.phase === "IDLE" ||
    state.phase === "UNINITIALIZED" || state.phase === "COMPLETED"
  ) {
    out.writeln(span.red(`Cannot mark as won't fix in phase: ${state.phase}`));
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
  let completedState = machine.completeSpec(state, "wontfix", reason);
  completedState = machine.recordTransition(
    completedState,
    state.phase,
    "COMPLETED",
    user,
    reason,
  );

  // Per-spec: preserve COMPLETED state for history
  if (completedState.spec !== null) {
    await persistence.writeSpecState(
      root,
      completedState.spec,
      completedState,
    );
  }

  // Global: return to IDLE
  const idleState = machine.resetToIdle(completedState);
  await persistence.writeState(root, idleState);

  // Update spec.md status
  if (completedState.spec !== null) {
    await specUpdater.updateSpecStatus(root, completedState.spec, "wontfix");
    await specUpdater.updateProgressStatus(
      root,
      completedState.spec,
      "wontfix",
    );
  }

  await dashboardEvents.appendEvent(root, {
    ts: new Date().toISOString(),
    type: "phase-change",
    spec: state.spec ?? "unknown",
    user: user.name,
    from: state.phase,
    to: "COMPLETED",
    reason: "wontfix",
  });

  out.writeln(span.green("✔"), ` Spec marked as won't fix: ${reason}`);
  await out.close();

  return results.ok(undefined);
};
