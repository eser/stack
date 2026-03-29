// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills reopen` — Reopen a completed spec for revision.
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
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const specFlag = persistence.parseSpecFlag(args);
  const state = await persistence.resolveState(root, specFlag);

  if (state.phase !== "COMPLETED") {
    out.writeln(span.red(`Cannot reopen in phase: ${state.phase}`));
    out.writeln(span.dim("Only COMPLETED specs can be reopened."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const newState = machine.reopenSpec(state);
  await persistence.writeState(root, newState);

  out.writeln(
    span.green("✔"),
    " Spec reopened. Discovery answers preserved — run `noskills next` to revise.",
  );
  await out.close();

  return results.ok(undefined);
};
