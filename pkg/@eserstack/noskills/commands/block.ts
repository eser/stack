// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills block "reason"` — Mark spec as blocked.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as identity from "../state/identity.ts";
import * as cmd from "../output/cmd.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
  const prefix = await cmd.loadCommandPrefix(root);
  const specResult = persistence.requireSpecFlag(args, prefix);
  if (!specResult.ok) {
    out.writeln(span.red(specResult.error));
    await out.close();
    return results.fail({ exitCode: 1 });
  }
  const filteredArgs = (args ?? []).filter((a) => !a.startsWith("--spec="));
  const joinedReason = filteredArgs.join(" ");
  const reason = joinedReason === "" ? "No reason given" : joinedReason;
  let state: schema.StateFile;
  try {
    state = await persistence.resolveState(root, specResult.spec, prefix);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(msg));
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
      out.writeln(
        span.dim(
          `Run \`${cmd.cmd(`spec ${state.spec} reset`)}\` to return to idle.`,
        ),
      );
      await out.close();
      return results.fail({ exitCode: 1 });
    }
  }

  if (state.phase !== "EXECUTING") {
    out.writeln(span.red(`Cannot block in phase: ${state.phase}`));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const user = await identity.resolveUser(root);
  let newState = machine.blockExecution(state, reason);
  newState = machine.recordTransition(
    newState,
    "EXECUTING",
    "BLOCKED",
    user,
    reason,
  );
  await persistence.writeStateAndSpec(root, newState);

  out.writeln(span.yellow("⚠"), " Spec blocked: ", span.dim(reason));
  out.writeln(
    "Resolve with: ",
    span.bold(
      `${cmd.cmd(`spec ${specResult.spec} next --answer="resolution"`)}`,
    ),
  );
  await out.close();

  return results.ok(undefined);
};
