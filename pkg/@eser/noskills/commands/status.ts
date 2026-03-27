// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills status` — Show current state (human-readable).
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import { QUESTIONS } from "../context/questions.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold("noskills init"),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const state = await persistence.readState(root);
  const config = await persistence.readManifest(root);

  out.writeln(span.bold("noskills status"));
  out.writeln("");

  // Phase
  const phaseColor = state.phase === "DONE"
    ? span.green(state.phase)
    : state.phase === "BLOCKED"
    ? span.red(state.phase)
    : state.phase === "EXECUTING"
    ? span.cyan(state.phase)
    : span.yellow(state.phase);

  out.writeln("  Phase:    ", phaseColor);

  if (state.spec !== null) {
    out.writeln("  Spec:     ", span.bold(state.spec));
  }
  if (state.branch !== null) {
    out.writeln("  Branch:   ", state.branch);
  }

  // Discovery progress
  if (state.phase === "DISCOVERY") {
    const answered = state.discovery.answers.length;
    out.writeln(
      `  Discovery: ${answered}/${QUESTIONS.length} questions answered`,
    );
  }

  // Execution progress
  if (state.phase === "EXECUTING") {
    out.writeln(`  Iteration: ${state.execution.iteration}`);
    if (state.execution.lastProgress !== null) {
      out.writeln("  Progress:  ", span.dim(state.execution.lastProgress));
    }
  }

  // Config info
  if (config !== null) {
    out.writeln("");
    if (config.concerns.length > 0) {
      out.writeln("  Concerns: ", span.dim(config.concerns.join(", ")));
    }
    if (config.tools.length > 0) {
      out.writeln("  Tools:    ", span.dim(config.tools.join(", ")));
    }
  }

  // Decisions
  if (state.decisions.length > 0) {
    out.writeln("");
    out.writeln(`  Decisions: ${state.decisions.length}`);
  }

  await out.close();

  return results.ok(undefined);
};
