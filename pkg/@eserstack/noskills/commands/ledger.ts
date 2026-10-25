// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills ledger` — read-only decision-ledger + summary for a spec.
 *
 * Emits machine-readable JSON (default) describing the resolved decisions and
 * the spec-maturity summary captured by the decision-ledger instrumentation.
 * Read-only: it never mutates state. Designed for programmatic consumers (the
 * GUI, dashboards, CI) — the GUI invokes it as `spec <name> ledger` and parses
 * stdout.
 *
 * Usage:
 *   noskills spec <name> ledger        (preferred — injects --spec=<name>)
 *   noskills ledger <name>
 *   noskills ledger --spec=<name> -o json
 *   noskills spec <name> ledger --format=measurement-draft   (CI/harness bridge)
 *
 * `--format=measurement-draft` emits a guided-only `measurement-report/v1` draft
 * (schemaVersion + guided.decisions) instead of the raw records + summary, so a
 * headless harness can feed it straight into the measurement/judging pipeline.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import * as persistence from "../state/persistence.ts";
import * as ledger from "../state/decision-ledger.ts";
import * as formatter from "../output/formatter.ts";
import * as cmd from "../output/cmd.ts";

/** Contract returned to programmatic consumers (e.g. the GUI). */
export type LedgerOutput = {
  readonly spec: string;
  readonly records: readonly ledger.LedgerRecord[];
  readonly summary: ledger.LedgerSummary | null;
};

type LedgerShape = "ledger" | "measurement-draft";

/** One decision as a list item: "id (phase, category, provenance): Q A". */
const decisionLine = (
  entry: {
    readonly id: string;
    readonly category: string;
    readonly question: string;
    readonly resolution: string;
    readonly provenance: string;
  },
  phase: string,
): string =>
  `- ${entry.id} (${phase}, ${entry.category}, ${entry.provenance}): ${entry.question} ${entry.resolution}`;

const summaryLines = (summary: ledger.LedgerSummary | null): string[] => {
  if (summary === null) return ["No summary yet."];

  const breakdown = summary.provenance_breakdown;
  const presence = (present: boolean | undefined) =>
    present === true ? "present" : "missing";

  return [
    `- Resolved decisions: ${summary.resolved_decisions} (ratified ${breakdown?.ratified}, inferred ${breakdown?.inferred}, default ${breakdown?.default})`,
    `- Open questions: ${summary.open_questions}`,
    `- Named artifacts: ${summary.specificity?.named_artifacts_count}`,
    `- Acceptance criteria: ${
      presence(summary.specificity?.acceptance_criteria_present)
    }`,
    `- Out of scope: ${presence(summary.specificity?.out_of_scope_present)}`,
  ];
};

/**
 * Lays out a document for `-o markdown`, or the same lines without the
 * markdown headings for `-o text`.
 */
const layout = (
  fmt: "markdown" | "text",
  title: string,
  sections: readonly (readonly [string, readonly string[]])[],
): string => {
  const lines = [fmt === "markdown" ? `# ${title}` : title];
  for (const [heading, body] of sections) {
    lines.push("", fmt === "markdown" ? `## ${heading}` : `${heading}:`, "");
    lines.push(...body);
  }

  return lines.join("\n");
};

/**
 * The ledger as `-o` asks: JSON as is, markdown and text as a document with
 * the records and the summary.
 */
export const formatLedger = (
  output: LedgerOutput,
  fmt: formatter.OutputFormat,
): string => {
  if (fmt !== "markdown" && fmt !== "text") {
    return formatter.format(output, fmt);
  }

  const decisions = output.records.length === 0
    ? ["No decisions recorded."]
    : output.records.map((record) => decisionLine(record, record.state));

  return layout(fmt, `Decision ledger: ${output.spec}`, [
    ["Decisions", decisions],
    ["Summary", summaryLines(output.summary)],
  ]);
};

/** A measurement draft as `-o` asks, its decisions listed like the ledger's. */
export const formatMeasurementDraft = (
  draft: ledger.MeasurementDraft,
  fmt: formatter.OutputFormat,
): string => {
  if (fmt !== "markdown" && fmt !== "text") return formatter.format(draft, fmt);

  const decisions = draft.guided.decisions.length === 0
    ? ["No decisions recorded."]
    : draft.guided.decisions.map((entry) => decisionLine(entry, entry.phase));

  return layout(fmt, draft.title, [["Decisions", decisions]]);
};

/** Parse `--format=<ledger|measurement-draft>` (default: ledger). */
const parseShape = (args: readonly string[]): LedgerShape => {
  for (const arg of args) {
    if (arg.startsWith("--format=")) {
      const value = arg.slice("--format=".length).toLowerCase();
      if (
        value === "measurement-draft" || value === "measurement" ||
        value === "draft"
      ) {
        return "measurement-draft";
      }
    }
  }
  return "ledger";
};

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { root } = await persistence.resolveProjectRoot();
  // The messages below name the project's command (cmd.cmdPrefix).
  await cmd.loadCommandPrefix(root);

  const rawArgs = args ?? [];
  // Spec name comes from --spec= (injected by `spec <name> ledger`) or the
  // first positional (`noskills ledger <name>`).
  const specFlag = persistence.parseSpecFlag(rawArgs);
  const positional = rawArgs.find((a) => !a.startsWith("-"));
  const specName = specFlag ?? positional ?? null;

  const fmt = formatter.parseOutputFormat(rawArgs);

  if (specName === null || specName.length === 0) {
    const out = streams.output({
      renderer: streams.renderers.ansi(),
      sink: streams.sinks.stdout(),
    });
    out.writeln(span.red("Error: spec name is required."));
    out.writeln(
      span.dim(
        `Usage: ${cmd.cmdPrefix()} spec <name> ledger   (or: ${cmd.cmdPrefix()} ledger <name>)`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // Reads are resilient: missing files yield [] / null, never throw.
  const records = await ledger.readLedger(root, specName);

  // Headless bridge: emit a guided-only measurement-report/v1 draft.
  if (parseShape(rawArgs) === "measurement-draft") {
    await formatter.writeLine(
      formatMeasurementDraft(ledger.toMeasurementDraft(specName, records), fmt),
    );
    return results.ok(undefined);
  }

  const summary = await ledger.readSummary(root, specName);
  const output: LedgerOutput = { spec: specName, records, summary };
  await formatter.writeLine(formatLedger(output, fmt));

  return results.ok(undefined);
};
