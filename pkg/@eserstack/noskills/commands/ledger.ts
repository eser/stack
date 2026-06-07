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
import { cmdPrefix } from "../output/cmd.ts";

/** Contract returned to programmatic consumers (e.g. the GUI). */
export type LedgerOutput = {
  readonly spec: string;
  readonly records: readonly ledger.LedgerRecord[];
  readonly summary: ledger.LedgerSummary | null;
};

type LedgerShape = "ledger" | "measurement-draft";

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
        `Usage: ${cmdPrefix()} spec <name> ledger   (or: ${cmdPrefix()} ledger <name>)`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // Reads are resilient: missing files yield [] / null, never throw.
  const records = await ledger.readLedger(root, specName);

  // Headless bridge: emit a guided-only measurement-report/v1 draft.
  if (parseShape(rawArgs) === "measurement-draft") {
    await formatter.writeFormatted(
      ledger.toMeasurementDraft(specName, records),
      fmt,
    );
    return results.ok(undefined);
  }

  const summary = await ledger.readSummary(root, specName);
  const output: LedgerOutput = { spec: specName, records, summary };
  await formatter.writeFormatted(output, fmt);

  return results.ok(undefined);
};
