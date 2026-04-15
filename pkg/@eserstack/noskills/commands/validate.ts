// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills validate` — Read-only completeness check for a spec.
 *
 * Reports unresolved placeholders and pending decisions without transitioning
 * phases. Exit code 0 = all sections resolved; 1 = blockers remain.
 * CI-friendly: use as a precommit hook or gate in your pipeline.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import * as persistence from "../state/persistence.ts";
import * as livingSpec from "../spec/living.ts";
import { cmdPrefix } from "../output/cmd.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();

  // Resolve spec name from args
  const rawArgs = args ?? [];
  const specName = rawArgs[0] ?? null;
  if (specName === null) {
    out.writeln(
      span.red("Error: spec name is required."),
    );
    out.writeln(
      span.dim(`Usage: ${cmdPrefix()} validate <spec-name>`),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // Read spec state
  let state;
  try {
    state = await persistence.readSpecState(root, specName);
  } catch {
    out.writeln(
      span.red(`Spec "${specName}" not found.`),
    );
    out.writeln(
      span.dim(
        `Run \`${cmdPrefix()} spec list\` to see available specs.`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  if (state === null) {
    out.writeln(span.red(`No state found for spec "${specName}".`));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const report = livingSpec.checkSpecCompleteness(state.specState);
  const visible = state.specState.placeholders.filter(
    (p) => p.status !== "conditional-hidden",
  );

  if (report.canAdvance) {
    out.writeln(
      span.green("✓"),
      " ",
      span.bold(specName),
      `: all ${visible.length} sections resolved`,
    );
    await out.close();
    return results.ok(undefined);
  }

  out.writeln(
    span.red("✗"),
    " ",
    span.bold(specName),
    `: ${report.unresolvedSections.length} unresolved, ${report.pendingDecisions.length} pending decisions`,
  );

  if (report.unresolvedSections.length > 0) {
    out.writeln("");
    out.writeln(span.yellow("Unresolved sections:"));
    for (const s of report.unresolvedSections) {
      out.writeln("  - ", s.sectionTitle);
    }
  }

  if (report.pendingDecisions.length > 0) {
    out.writeln("");
    out.writeln(span.yellow("Pending decisions:"));
    for (const d of report.pendingDecisions) {
      out.writeln(
        "  - ",
        `${d.section}: ${d.question}`,
        span.dim(` (waiting for ${d.waitingFor.join(", ")})`),
      );
    }
  }

  out.writeln("");
  out.writeln(
    span.dim(
      `Run \`${cmdPrefix()} spec ${specName} next\` to fill remaining sections.`,
    ),
  );

  await out.close();
  return results.fail({ exitCode: 1 });
};
