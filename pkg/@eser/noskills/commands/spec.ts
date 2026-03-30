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
import * as schema from "../state/schema.ts";
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

  const prefix = cmdPrefix();
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln(
    `Usage: ${prefix} spec <new --name=<slug> "description" | list>`,
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
  let specName: string | null = null;
  const descWords: string[] = [];

  if (args !== undefined) {
    for (const arg of args) {
      if (arg.startsWith("--name=")) {
        specName = arg.slice("--name=".length);
      } else if (!arg.startsWith("-")) {
        descWords.push(arg);
      }
    }
  }

  const description = descWords.join(" ");

  if (specName === null || specName.length === 0) {
    out.writeln(
      span.red("Error: --name is required."),
    );
    out.writeln(
      span.dim("Example: "),
      span.bold(
        `${cmdPrefix()} spec new --name=photo-upload "photo upload feature"`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Validate name: lowercase, hyphens, numbers only. Max 50 chars.
  const NAME_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  if (
    specName.length > 50 ||
    (specName.length > 1 && !NAME_REGEX.test(specName)) ||
    (specName.length === 1 && !/^[a-z0-9]$/.test(specName))
  ) {
    out.writeln(
      span.red("Invalid spec name: "),
      span.bold(specName),
    );
    out.writeln(
      span.dim(
        "Must be lowercase, hyphens, numbers only. Max 50 chars. Regex: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/",
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (description.length === 0) {
    out.writeln(
      span.red("Please provide a description: "),
      span.bold(
        `${cmdPrefix()} spec new --name=${specName} "photo upload feature"`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }
  const branch = `spec/${specName}`;

  // Check if spec name already exists
  const specDir = `${root}/${persistence.paths.specDir(specName)}`;
  try {
    await runtime.fs.stat(specDir);
    out.writeln(
      span.red(`Spec "${specName}" already exists.`),
      span.dim(
        ` Use a different --name or run \`${cmdPrefix()} reset --spec=${specName}\` first.`,
      ),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  } catch {
    // Directory doesn't exist — good, proceed
  }

  // Create a fresh state for the new spec (independent of other specs)
  const freshState = schema.createInitialState();
  const newState = machine.startSpec(freshState, specName, branch);

  // Create spec directory and save state
  await runtime.fs.mkdir(
    `${root}/${persistence.paths.specDir(specName)}`,
    {
      recursive: true,
    },
  );
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
    span.bold(cmd(`next --spec=${specName}`)),
    " to begin discovery questions.",
  );
  await out.close();

  return results.ok(undefined);
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
  const specStates = await persistence.listSpecStates(root);

  // Also check spec directories that might not have state files yet
  const specsDir = `${root}/${persistence.paths.specsDir}`;
  const knownNames = new Set(specStates.map((s) => s.name));
  const allSpecs: {
    name: string;
    phase: string;
    iteration: number;
  }[] = [];

  for (const ss of specStates) {
    allSpecs.push({
      name: ss.name,
      phase: ss.state.phase,
      iteration: ss.state.execution.iteration,
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
      const phaseStr = spec.phase === "COMPLETED"
        ? span.green(spec.phase)
        : spec.phase === "EXECUTING"
        ? span.cyan(spec.phase)
        : spec.phase === "BLOCKED"
        ? span.red(spec.phase)
        : span.yellow(spec.phase);

      const iterStr = spec.phase === "EXECUTING"
        ? span.dim(` iteration ${spec.iteration}`)
        : "";

      out.writeln("  ", span.dim("○"), " ", spec.name, "  ", phaseStr, iterStr);
    }
  }

  await out.close();

  return results.ok(undefined);
};
