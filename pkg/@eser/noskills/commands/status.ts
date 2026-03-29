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
import * as compiler from "../context/compiler.ts";
import * as syncEngine from "../sync/engine.ts";
import { QUESTIONS } from "../context/questions.ts";
import * as formatter from "../output/formatter.ts";
import { cmd } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root = runtime.process.cwd();
  const fmt = formatter.parseOutputFormat(args);

  if (!(await persistence.isInitialized(root))) {
    if (fmt === "json") {
      await formatter.writeFormatted(
        { error: "noskills is not initialized" },
        fmt,
      );
    } else {
      const out = streams.output({
        renderer: streams.renderers.ansi(),
        sink: streams.sinks.stdout(),
      });
      out.writeln(
        span.red("noskills is not initialized."),
        " Run: ",
        span.bold(cmd("init")),
      );
      await out.close();
    }

    return results.fail({ exitCode: 1 });
  }

  const specFlag = persistence.parseSpecFlag(args);
  const state = await persistence.resolveState(root, specFlag);
  const config = await persistence.readManifest(root);

  // Build structured status data
  const statusData = {
    phase: state.phase,
    spec: state.spec,
    branch: state.branch,
    discovery: state.phase === "DISCOVERY" || state.phase === "DISCOVERY_REVIEW"
      ? {
        answered: state.discovery.answers.length,
        total: QUESTIONS.length,
      }
      : undefined,
    execution: state.phase === "EXECUTING" || state.phase === "BLOCKED"
      ? {
        iteration: state.execution.iteration,
        lastProgress: state.execution.lastProgress,
        debt: state.execution.debt?.items.length ?? 0,
        verificationPassed: state.execution.lastVerification?.passed ?? null,
      }
      : undefined,
    concerns: config?.concerns ?? [],
    tools: config?.tools ?? [],
    decisions: state.decisions.length,
  };

  // JSON mode: use compiler.compile for full output with interactiveOptions
  if (fmt === "json") {
    const allConcerns = await persistence.listConcerns(root);
    const activeConcerns = allConcerns.filter((c) =>
      config !== null && config.concerns.includes(c.id)
    );
    const rules = await syncEngine.loadRules(root);
    const output = compiler.compile(state, activeConcerns, rules, config);

    // Merge status-specific data with compiled output
    await formatter.writeFormatted({ ...statusData, ...output }, "json");

    return results.ok(undefined);
  }

  // ANSI-formatted output for human modes
  {
    const out = streams.output({
      renderer: streams.renderers.ansi(),
      sink: streams.sinks.stdout(),
    });

    out.writeln(span.bold(`${cmd("status")}`));
    out.writeln("");

    const phaseColor = state.phase === "COMPLETED"
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
    if (state.phase === "DISCOVERY" || state.phase === "DISCOVERY_REVIEW") {
      out.writeln(
        `  Discovery: ${state.discovery.answers.length}/${QUESTIONS.length} questions answered`,
      );
    }
    if (state.phase === "EXECUTING") {
      out.writeln(`  Iteration: ${state.execution.iteration}`);
      if (state.execution.lastProgress !== null) {
        out.writeln(
          "  Progress:  ",
          span.dim(state.execution.lastProgress),
        );
      }
      if (state.execution.debt !== null) {
        out.writeln(
          span.yellow(
            `  Debt:      ${state.execution.debt.items.length} items`,
          ),
        );
      }
    }
    if (config !== null) {
      out.writeln("");
      if (config.concerns.length > 0) {
        out.writeln("  Concerns: ", span.dim(config.concerns.join(", ")));
      }
      if (config.tools.length > 0) {
        out.writeln("  Tools:    ", span.dim(config.tools.join(", ")));
      }
    }
    if (state.decisions.length > 0) {
      out.writeln("");
      out.writeln(`  Decisions: ${state.decisions.length}`);
    }
    await out.close();
  }

  return results.ok(undefined);
};
