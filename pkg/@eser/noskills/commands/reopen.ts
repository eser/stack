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

  if (state.phase !== "COMPLETED") {
    out.writeln(span.red(`Cannot reopen in phase: ${state.phase}`));
    out.writeln(span.dim("Only COMPLETED specs can be reopened."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const newState = machine.reopenSpec(state);
  await persistence.writeState(root, newState);
  if (newState.spec !== null) {
    await persistence.writeSpecState(root, newState.spec, newState);
  }

  out.writeln(
    span.green("✔"),
    " Spec reopened. Discovery answers preserved — run `noskills next` to revise.",
  );
  await out.close();

  return results.ok(undefined);
};
