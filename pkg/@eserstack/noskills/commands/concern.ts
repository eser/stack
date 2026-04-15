// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills concern` — Manage active concerns (add, remove, list).
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import * as persistence from "../state/persistence.ts";
import * as schema from "../state/schema.ts";
import * as formatter from "../output/formatter.ts";
import { detectTensions, loadDefaultConcerns } from "../context/concerns.ts";
import { cmd, cmdPrefix } from "../output/cmd.ts";

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
    return await concernList(args?.slice(1));
  }

  const prefix = cmdPrefix();
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

  const { root } = await persistence.resolveProjectRoot();
  const concernIds = (args ?? []).filter((a) => !a.startsWith("-"));

  const config = await persistence.readManifest(root);

  if (concernIds.length === 0) {
    out.writeln(
      span.red("Please provide concern ID(s): "),
      span.bold(cmd("concern add open-source beautiful-product")),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  if (config === null) {
    out.writeln(span.red("noskills not initialized."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  const defaults = await loadDefaultConcerns();
  const added: string[] = [];

  for (const concernId of concernIds) {
    // Find concern: check .eser/concerns/ first, then built-in defaults
    let concern = await persistence.readConcern(root, concernId);

    if (concern === null) {
      concern = defaults.find((c) => c.id === concernId) ?? null;

      if (concern !== null) {
        await persistence.writeConcern(root, concern);
      }
    }

    if (concern === null) {
      out.writeln(span.red(`Unknown concern: ${concernId}`));
      out.writeln(
        span.dim(
          `  Available: ${defaults.map((c) => c.id).join(", ")}`,
        ),
      );
      continue;
    }

    if (config.concerns.includes(concernId) || added.includes(concernId)) {
      out.writeln(span.dim(`Concern "${concernId}" is already active.`));
      continue;
    }

    added.push(concernId);
  }

  if (added.length > 0) {
    const newConfig = {
      ...config,
      concerns: [...config.concerns, ...added],
    };
    await persistence.writeManifest(root, newConfig);

    out.writeln(
      span.green("✔"),
      ` Activated concerns: ${added.join(", ")}`,
    );
  }

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

  const { root } = await persistence.resolveProjectRoot();
  const concernId = args?.[0];

  const config = await persistence.readManifest(root);

  if (concernId === undefined || concernId.length === 0) {
    out.writeln(
      span.red("Please provide a concern ID: "),
      span.bold(cmd("concern remove move-fast")),
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

const capitalize = (s: string): string =>
  s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);

const concernList = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const jsonMode = args?.includes("--json") ?? false;

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
  const config = await persistence.readManifest(root);

  // Show all built-in concerns (not just locally installed ones)
  const allConcerns = await loadDefaultConcerns();
  const activeConcernIds = config?.concerns ?? [];
  const activeConcernDefs = allConcerns.filter((c) =>
    activeConcernIds.includes(c.id)
  );

  if (jsonMode) {
    await out.close();
    await formatter.writeFormatted(
      {
        concerns: allConcerns.map((c) => ({
          id: c.id,
          description: c.description,
          category: c.category ?? "general",
          isActive: activeConcernIds.includes(c.id),
        })),
        active: activeConcernIds,
      },
      "json",
    );
    return results.ok(undefined);
  }

  // Group by category (lowercase key → capitalize on display)
  const groups = new Map<string, schema.ConcernDefinition[]>();
  for (const concern of allConcerns) {
    const cat = concern.category ?? "general";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(concern);
  }

  out.writeln(
    span.bold("Concerns"),
    span.dim(
      ` (${allConcerns.length} available, ${activeConcernIds.length} active)`,
    ),
  );
  out.writeln("");

  if (allConcerns.length === 0) {
    out.writeln(span.dim("  No concerns defined."));
  } else {
    for (const [category, concerns] of groups) {
      out.writeln(span.bold(capitalize(category) + ":"));
      for (const concern of concerns) {
        const isActive = activeConcernIds.includes(concern.id);
        out.writeln(
          "  ",
          isActive ? span.green("●") : span.dim("○"),
          " ",
          isActive
            ? span.bold(concern.id.padEnd(24))
            : span.dim(concern.id.padEnd(24)),
          span.dim(concern.description),
        );
      }
      out.writeln("");
    }
  }

  // Tension warnings
  try {
    const tensions = detectTensions(activeConcernDefs);
    if (tensions.length > 0) {
      out.writeln(span.yellow("⚠ Tensions detected:"));
      for (const t of tensions) {
        out.writeln(
          span.dim(`  ${t.between[0]} ↔ ${t.between[1]}: ${t.issue}`),
        );
      }
      out.writeln("");
    }
  } catch {
    // best-effort — never crash concern list on tension detection failure
  }

  await out.close();

  return results.ok(undefined);
};
