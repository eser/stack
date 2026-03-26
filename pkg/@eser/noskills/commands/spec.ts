// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills spec` — Manage specs (new, list).
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const subcommand = args?.[0];

  if (subcommand === "new") {
    return await specNew(args?.slice(1));
  }

  if (subcommand === "list") {
    return await specList();
  }

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln('Usage: noskills spec <new "description" | list>');
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// spec new
// =============================================================================

const specNew = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = Deno.cwd();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold("noskills init"),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const description = args?.join(" ");

  if (description === undefined || description.length === 0) {
    out.writeln(
      span.red("Please provide a description: "),
      span.bold('noskills spec new "photo auto-listing"'),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Slugify description
  const specName = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const branch = `spec/${specName}`;

  const state = await persistence.readState(root);

  if (state.phase !== "IDLE" && state.phase !== "DONE") {
    out.writeln(
      span.red(`Cannot start new spec in phase: ${state.phase}`),
      span.dim(" — finish or reset the current spec first."),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const newState = machine.startSpec(
    state.phase === "DONE" ? machine.resetToIdle(state) : state,
    specName,
    branch,
  );

  // Create spec directory
  await Deno.mkdir(`${root}/${persistence.paths.specDir(specName)}`, {
    recursive: true,
  });
  await persistence.writeState(root, newState);

  out.writeln(span.green("✔"), " Spec started: ", span.bold(specName));
  out.writeln("  Branch: ", span.dim(branch));
  out.writeln("  Phase:  ", span.yellow("DISCOVERY"));
  out.writeln("");
  out.writeln(
    "Run ",
    span.bold("noskills next"),
    " to begin discovery questions.",
  );
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// spec list
// =============================================================================

const specList = async (): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = Deno.cwd();
  const specsDir = `${root}/${persistence.paths.specsDir}`;

  out.writeln(span.bold("Specs"));
  out.writeln("");

  try {
    let count = 0;

    for await (const entry of Deno.readDir(specsDir)) {
      if (entry.isDirectory) {
        const hasSpec = await Deno.stat(`${specsDir}/${entry.name}/spec.md`)
          .then(() => true)
          .catch(() => false);

        out.writeln(
          "  ",
          hasSpec ? span.green("●") : span.dim("○"),
          " ",
          span.bold(entry.name),
          hasSpec ? span.dim("  spec.md") : span.dim("  (no spec yet)"),
        );
        count++;
      }
    }

    if (count === 0) {
      out.writeln(span.dim("  No specs yet."));
    }
  } catch {
    out.writeln(span.dim("  No specs directory."));
  }

  await out.close();

  return results.ok(undefined);
};
