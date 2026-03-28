// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills concern` — Manage active concerns (add, remove, list).
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import { loadDefaultConcerns } from "../context/concerns.ts";
import { cmd, cmdPrefix } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const subcommand = args?.[0];

  if (subcommand === "add") {
    return await concernAdd(args?.slice(1));
  }

  if (subcommand === "remove") {
    return await concernRemove(args?.slice(1));
  }

  if (subcommand === "list") {
    return await concernList();
  }

  const config = await persistence.readManifest(runtime.process.cwd());
  const prefix = cmdPrefix(config);
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln(`Usage: ${prefix} concern <add <id> | remove <id> | list>`);
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// concern add
// =============================================================================

const concernAdd = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const concernId = args?.[0];

  const config = await persistence.readManifest(root);

  if (concernId === undefined || concernId.length === 0) {
    out.writeln(
      span.red("Please provide a concern ID: "),
      span.bold(cmd("concern add open-source", config)),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Find concern: check .eser/concerns/ first, then built-in defaults
  let concern = await persistence.readConcern(root, concernId);

  if (concern === null) {
    // Try built-in defaults
    const defaults = await loadDefaultConcerns();
    concern = defaults.find((c) => c.id === concernId) ?? null;

    if (concern !== null) {
      // Write the built-in concern to .eser/concerns/ so it's available locally
      await persistence.writeConcern(root, concern);
    }
  }

  if (concern === null) {
    const available = await loadDefaultConcerns();
    out.writeln(span.red(`Unknown concern: ${concernId}`));
    if (available.length > 0) {
      out.writeln(
        span.dim(
          `  Available: ${available.map((c) => c.id).join(", ")}`,
        ),
      );
    }
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (config === null) {
    out.writeln(span.red("noskills not initialized."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (config.concerns.includes(concernId)) {
    out.writeln(span.dim(`Concern "${concernId}" is already active.`));
    await out.close();

    return results.ok(undefined);
  }

  const newConfig = {
    ...config,
    concerns: [...config.concerns, concernId],
  };
  await persistence.writeManifest(root, newConfig);

  out.writeln(span.green("✔"), " Activated concern: ", span.bold(concernId));
  out.writeln(span.dim(`  ${concern.description}`));
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// concern remove
// =============================================================================

const concernRemove = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const concernId = args?.[0];

  const config = await persistence.readManifest(root);

  if (concernId === undefined || concernId.length === 0) {
    out.writeln(
      span.red("Please provide a concern ID: "),
      span.bold(cmd("concern remove move-fast", config)),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (config === null) {
    out.writeln(span.red("noskills not initialized."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (!config.concerns.includes(concernId)) {
    out.writeln(span.dim(`Concern "${concernId}" is not active.`));
    await out.close();

    return results.ok(undefined);
  }

  const newConfig = {
    ...config,
    concerns: config.concerns.filter((c) => c !== concernId),
  };
  await persistence.writeManifest(root, newConfig);

  out.writeln(span.green("✔"), " Deactivated concern: ", span.bold(concernId));
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// concern list
// =============================================================================

const concernList = async (): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const config = await persistence.readManifest(root);

  // Show all built-in concerns (not just locally installed ones)
  const allConcerns = await loadDefaultConcerns();
  const activeConcernIds = config?.concerns ?? [];

  out.writeln(span.bold("Concerns"));
  out.writeln("");

  if (allConcerns.length === 0) {
    out.writeln(span.dim("  No concerns defined."));
  } else {
    for (const concern of allConcerns) {
      const isActive = activeConcernIds.includes(concern.id);
      out.writeln(
        "  ",
        isActive ? span.green("●") : span.dim("○"),
        " ",
        isActive ? span.bold(concern.id) : span.dim(concern.id),
        span.dim(`  ${concern.description.slice(0, 60)}...`),
      );
    }
  }

  await out.close();

  return results.ok(undefined);
};
