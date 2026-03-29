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
  const specFlag = persistence.parseSpecFlag(args);
  const filteredArgs = (args ?? []).filter((a) => !a.startsWith("--spec="));
  const reason = filteredArgs.join(" ");

  if (reason.length === 0) {
    out.writeln(
      span.red('A reason is required: noskills wontfix "reason text"'),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const state = await persistence.resolveState(root, specFlag);

  if (
    state.phase === "IDLE" || state.phase === "UNINITIALIZED" ||
    state.phase === "COMPLETED"
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
      out.writeln(span.dim("Run `noskills reset` to return to IDLE."));
      await out.close();
      return results.fail({ exitCode: 1 });
    }
  }

  const newState = machine.completeSpec(state, "wontfix", reason);
  await persistence.writeState(root, newState);

  // Update spec.md status
  if (newState.spec !== null) {
    await specUpdater.updateSpecStatus(root, newState.spec, "wontfix");
    await specUpdater.updateProgressStatus(root, newState.spec, "wontfix");
  }

  out.writeln(span.green("✔"), ` Spec marked as won't fix: ${reason}`);
  await out.close();

  return results.ok(undefined);
};
