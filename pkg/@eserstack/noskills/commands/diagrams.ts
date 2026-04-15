// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills diagrams` — Manage diagram registry and staleness checks.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import * as persistence from "../state/persistence.ts";
import * as diagrams from "../dashboard/diagrams.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
  const sub = args?.[0];

  // noskills diagrams scan — scan project and update registry
  if (sub === "scan") {
    const entries = await diagrams.scanProject(root);
    await diagrams.writeRegistry(root, entries);

    out.writeln(span.green("\u2714"), ` Found ${entries.length} diagram(s):`);
    for (const e of entries) {
      out.writeln(
        `  ${e.file}:${e.line} `,
        span.dim(`[${e.type}]`),
        span.dim(` refs: ${e.referencedFiles.length}`),
      );
    }
    await out.close();
    return results.ok(undefined);
  }

  // noskills diagrams list — show registered diagrams
  if (sub === "list" || sub === undefined) {
    const registry = await diagrams.readRegistry(root);

    if (registry.length === 0) {
      out.writeln(
        span.dim("No diagrams registered. Run: noskills diagrams scan"),
      );
      await out.close();
      return results.ok(undefined);
    }

    out.writeln(span.bold(`${registry.length} diagram(s):`));
    for (const e of registry) {
      out.writeln(
        `  ${e.file}:${e.line} `,
        span.dim(`[${e.type}]`),
        ` refs: ${e.referencedFiles.join(", ") || "none"}`,
      );
      out.writeln(
        span.dim(`    verified: ${e.lastVerified.slice(0, 10)}`),
      );
    }
    await out.close();
    return results.ok(undefined);
  }

  // noskills diagrams check — check for stale diagrams
  if (sub === "check") {
    // Get modified files from the current state's execution
    const state = await persistence.readState(root);
    const modifiedFiles = state.execution.modifiedFiles;

    const stale = await diagrams.checkStaleness(root, modifiedFiles);

    if (stale.length === 0) {
      out.writeln(span.green("\u2714"), " No stale diagrams.");
    } else {
      out.writeln(
        span.yellow(`\u26A0 ${stale.length} potentially stale diagram(s):`),
      );
      for (const s of stale) {
        out.writeln(`  ${s.file}:${s.line} `, span.dim(`[${s.type}]`));
        out.writeln(span.dim(`    ${s.reason}`));
      }
    }
    await out.close();
    return results.ok(undefined);
  }

  // noskills diagrams verify <file> [--line=N]
  if (sub === "verify") {
    const file = args?.[1];
    if (!file) {
      out.writeln(span.red("Usage: noskills diagrams verify <file>"));
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    let line: number | undefined;
    for (const arg of args ?? []) {
      if (arg.startsWith("--line=")) {
        line = parseInt(arg.slice("--line=".length), 10);
      }
    }

    const verified = await diagrams.verifyDiagram(root, file, line);
    if (verified) {
      out.writeln(span.green("\u2714"), ` Verified: ${file}`);
    } else {
      out.writeln(span.red(`Diagram not found in registry: ${file}`));
    }
    await out.close();
    return results.ok(undefined);
  }

  out.writeln(
    span.red("Unknown subcommand. Use: scan, list, check, verify"),
  );
  await out.close();
  return results.fail({ exitCode: 1 });
};
