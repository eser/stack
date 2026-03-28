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
import { cmd, cmdPrefix } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const subcommand = args?.[0];

  if (subcommand === "new") {
    return await specNew(args?.slice(1));
  }

  if (subcommand === "list") {
    return await specList(args?.slice(1));
  }

  if (subcommand === "switch") {
    return await specSwitch(args?.slice(1));
  }

  const prefix = cmdPrefix();
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln(
    `Usage: ${prefix} spec <new "description" | list | switch <name>>`,
  );
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

  const root = runtime.process.cwd();

  if (!(await persistence.isInitialized(root))) {
    out.writeln(
      span.red("noskills is not initialized."),
      " Run: ",
      span.bold(cmd("init")),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Parse --name flag and collect description words
  let explicitName: string | null = null;
  const descWords: string[] = [];

  if (args !== undefined) {
    for (const arg of args) {
      if (arg.startsWith("--name=")) {
        explicitName = arg.slice("--name=".length);
      } else if (!arg.startsWith("-")) {
        descWords.push(arg);
      }
    }
  }

  const description = descWords.join(" ");

  if (description.length === 0) {
    out.writeln(
      span.red("Please provide a description: "),
      span.bold(`${cmdPrefix()} spec new "photo auto-listing"`),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Determine spec name: explicit --name or slugified from description
  const baseSlug = explicitName ?? slugify(description);
  const specName = await deduplicateSlug(root, baseSlug);
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

  // Create spec directory and save state
  await runtime.fs.mkdir(
    `${root}/${persistence.paths.specDir(specName)}`,
    {
      recursive: true,
    },
  );
  await persistence.writeState(root, newState);
  await persistence.writeSpecState(root, specName, newState);

  out.writeln(span.green("✔"), " Spec started: ", span.bold(specName));
  out.writeln(
    "  Directory: ",
    span.dim(persistence.paths.specDir(specName)),
  );
  out.writeln("  Branch:    ", span.dim(branch));
  out.writeln("  Phase:     ", span.yellow("DISCOVERY"));
  out.writeln("");
  out.writeln(
    "Run ",
    span.bold(cmd("next")),
    " to begin discovery questions.",
  );
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// Slug utilities
// =============================================================================

/** Lowercase, spaces to hyphens, strip special chars, truncate at 50. */
/** Lowercase, strip accents (NFD + remove combining marks), hyphens, truncate. */
const slugify = (text: string): string => {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .replace(/-$/, "");
};

/** If slug already exists as a spec directory, append -2, -3, etc. */
const deduplicateSlug = async (
  root: string,
  slug: string,
): Promise<string> => {
  const specsDir = `${root}/${persistence.paths.specsDir}`;

  // Check if base slug exists
  const exists = async (name: string): Promise<boolean> => {
    try {
      await runtime.fs.stat(`${specsDir}/${name}`);
      return true;
    } catch {
      return false;
    }
  };

  if (!(await exists(slug))) return slug;

  // Append suffix
  for (let i = 2; i <= 99; i++) {
    const candidate = `${slug}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }

  // Fallback: timestamp
  return `${slug}-${Date.now()}`;
};

// =============================================================================
// spec list
// =============================================================================

import * as formatter from "../output/formatter.ts";

const specList = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root = runtime.process.cwd();
  const fmt = formatter.parseOutputFormat(args);
  const activeSpec = await persistence.readActiveSpec(root);
  const specStates = await persistence.listSpecStates(root);

  // Also check spec directories that might not have state files yet
  const specsDir = `${root}/${persistence.paths.specsDir}`;
  const knownNames = new Set(specStates.map((s) => s.name));
  const allSpecs: {
    name: string;
    phase: string;
    iteration: number;
    active: boolean;
  }[] = [];

  for (const ss of specStates) {
    allSpecs.push({
      name: ss.name,
      phase: ss.state.phase,
      iteration: ss.state.execution.iteration,
      active: ss.name === activeSpec,
    });
  }

  // Pick up spec directories without state files
  try {
    for await (const entry of runtime.fs.readDir(specsDir)) {
      if (entry.isDirectory && !knownNames.has(entry.name)) {
        allSpecs.push({
          name: entry.name,
          phase: "IDLE",
          iteration: 0,
          active: entry.name === activeSpec,
        });
      }
    }
  } catch {
    // No specs directory
  }

  if (fmt === "json") {
    await formatter.writeFormatted(allSpecs, "json");

    return results.ok(undefined);
  }

  // ANSI output
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  out.writeln(span.bold("Specs"));
  out.writeln("");

  if (allSpecs.length === 0) {
    out.writeln(span.dim("  No specs yet."));
  } else {
    for (const spec of allSpecs) {
      const indicator = spec.active ? span.green("●") : span.dim("○");
      const nameStr = spec.active ? span.bold(spec.name) : span.dim(spec.name);
      const phaseStr = spec.phase === "DONE"
        ? span.green(spec.phase)
        : spec.phase === "EXECUTING"
        ? span.cyan(spec.phase)
        : spec.phase === "BLOCKED"
        ? span.red(spec.phase)
        : span.yellow(spec.phase);

      const iterStr = spec.phase === "EXECUTING"
        ? span.dim(` iteration ${spec.iteration}`)
        : "";

      out.writeln("  ", indicator, " ", nameStr, "  ", phaseStr, iterStr);
    }
  }

  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// spec switch
// =============================================================================

const specSwitch = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const targetName = args?.[0];

  if (targetName === undefined || targetName.length === 0) {
    out.writeln(
      span.red("Please provide a spec name: "),
      span.bold(`${cmdPrefix()} spec switch my-feature`),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Save current state to its per-spec file before switching
  const currentActive = await persistence.readActiveSpec(root);
  const currentState = await persistence.readState(root);

  if (currentActive !== null && currentState.spec !== null) {
    await persistence.writeSpecState(root, currentActive, currentState);
  }

  // Check target exists (has a spec directory or state file)
  const targetState = await persistence.readSpecState(root, targetName);
  const specDirExists = await runtime.fs
    .stat(`${root}/${persistence.paths.specDir(targetName)}`)
    .then(() => true)
    .catch(() => false);

  if (
    targetState.phase === "IDLE" && !specDirExists
  ) {
    out.writeln(span.red(`Spec "${targetName}" not found.`));
    out.writeln(
      span.dim(`Run \`${cmd("spec list")}\` to see available specs.`),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Switch: load target state as the main state (state.json's "spec" field = active spec)
  await persistence.writeState(root, targetState);

  out.writeln(
    span.green("✔"),
    " Switched to: ",
    span.bold(targetName),
    " (",
    span.cyan(targetState.phase),
    ")",
  );

  if (targetState.phase === "EXECUTING") {
    out.writeln(
      span.dim(`  Iteration: ${targetState.execution.iteration}`),
    );
    if (targetState.execution.lastProgress !== null) {
      out.writeln(
        span.dim(`  Progress:  ${targetState.execution.lastProgress}`),
      );
    }
  }

  await out.close();

  return results.ok(undefined);
};
