// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills free` — Enter or exit free mode (no enforcement).
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
  const isExit = args !== undefined &&
    args.some((a) => a === "--exit");

  let state: schema.StateFile;
  try {
    state = await persistence.readState(root);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(msg));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  if (isExit) {
    if (state.phase !== "FREE") {
      out.writeln(span.red(`Cannot exit free mode in phase: ${state.phase}`));
      out.writeln(
        span.dim("Only FREE phase can transition back to IDLE."),
      );
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    const newState = machine.exitFreeMode(state);
    await persistence.writeState(root, newState);

    out.writeln(span.green("✔"), " Exited free mode. Back to IDLE.");
    out.writeln("");
    out.writeln(
      "Start a spec with: ",
      span.bold(`${cmd('spec new "..."')}`),
    );
    await out.close();
    return results.ok(undefined);
  }

  // Enter free mode
  if (state.phase !== "IDLE") {
    out.writeln(span.red(`Cannot enter free mode in phase: ${state.phase}`));
    out.writeln(
      span.dim("Only IDLE phase can transition to FREE."),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const newState = machine.enterFreeMode(state);
  await persistence.writeState(root, newState);

  out.writeln(span.green("✔"), " Free mode active — no enforcement.");
  out.writeln("");
  out.writeln(
    "Exit free mode with: ",
    span.bold(`${cmd("free --exit")}`),
  );
  await out.close();

  return results.ok(undefined);
};
