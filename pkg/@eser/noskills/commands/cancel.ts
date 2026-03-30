// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills cancel` — Cancel current spec.
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
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
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

  if (
    state.phase === "IDLE" || state.phase === "FREE" ||
    state.phase === "UNINITIALIZED" || state.phase === "COMPLETED"
  ) {
    out.writeln(span.red(`Cannot cancel in phase: ${state.phase}`));
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

  const newState = machine.completeSpec(state, "cancelled");
  await persistence.writeState(root, newState);
  if (newState.spec !== null) {
    await persistence.writeSpecState(root, newState.spec, newState);
  }

  // Update spec.md status
  if (newState.spec !== null) {
    await specUpdater.updateSpecStatus(root, newState.spec, "cancelled");
    await specUpdater.updateProgressStatus(root, newState.spec, "cancelled");
  }

  out.writeln(span.green("✔"), " Spec cancelled.");
  await out.close();

  return results.ok(undefined);
};
