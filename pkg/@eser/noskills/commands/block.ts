// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills block "reason"` — Mark spec as blocked.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
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
  const reason = args?.join(" ") ?? "No reason given";
  const state = await persistence.readState(root);
  const config = await persistence.readManifest(root);

  if (state.phase !== "EXECUTING") {
    out.writeln(span.red(`Cannot block in phase: ${state.phase}`));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const newState = machine.blockExecution(state, reason);
  await persistence.writeState(root, newState);

  out.writeln(span.yellow("⚠"), " Spec blocked: ", span.dim(reason));
  out.writeln(
    "Resolve with: ",
    span.bold(`${cmd('next --answer="resolution"', config)}`),
  );
  await out.close();

  return results.ok(undefined);
};
