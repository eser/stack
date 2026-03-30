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
import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
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

  if (state.phase === "IDLE" || state.phase === "UNINITIALIZED") {
    out.writeln(span.dim("Already idle. Nothing to reset."));
    await out.close();

    return results.ok(undefined);
  }

  // State integrity check: verify active spec directory exists
  if (state.spec !== null) {
    const specDir = `${root}/${persistence.paths.specDir(state.spec)}`;
    try {
      await runtime.fs.stat(specDir);
    } catch {
      out.writeln(span.red(`Active spec '${state.spec}' directory not found.`));
      out.writeln(span.dim("Resetting to IDLE anyway."));
    }
  }

  const specName = state.spec;
  const newState = machine.resetToIdle(state);
  await persistence.writeState(root, newState);
  if (specName !== null) {
    await persistence.writeSpecState(root, specName, newState);
  }

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
