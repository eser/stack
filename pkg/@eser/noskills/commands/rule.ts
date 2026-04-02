// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills rule` — Manage rules (add, list, promote).
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as syncEngine from "../sync/engine.ts";
import { cmd, cmdPrefix } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const subcommand = args?.[0];

  if (subcommand === "add") {
    return await ruleAdd(args?.slice(1));
  }

  if (subcommand === "list") {
    return await ruleList();
  }

  if (subcommand === "promote") {
    return await rulePromote(args?.slice(1));
  }

  const prefix = cmdPrefix();
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln(
    `Usage: ${prefix} rule <add "rule text" | list | promote "decision">`,
  );
  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// rule add
// =============================================================================

const ruleAdd = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();

  // Parse flags and collect rule text
  let phases: string[] = [];
  let appliesTo: string[] = [];
  const textParts: string[] = [];

  if (args !== undefined) {
    for (const arg of args) {
      if (arg.startsWith("--phases=")) {
        phases = arg.slice("--phases=".length).split(",").map((s) => s.trim());
      } else if (arg.startsWith("--applies-to=")) {
        appliesTo = arg.slice("--applies-to=".length).split(",").map((s) =>
          s.trim().replace(/^["']|["']$/g, "")
        );
      } else if (!arg.startsWith("-")) {
        textParts.push(arg);
      }
    }
  }

  const ruleText = textParts.join(" ");
  const config = await persistence.readManifest(root);

  if (ruleText.length === 0) {
    out.writeln(
      span.red("Please provide a rule: "),
      span.bold(`${cmd('rule add "Use Deno Tests for all tests"')}`),
    );
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  // Slugify for filename
  const slug = ruleText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  // Build file content with optional frontmatter
  let content = "";
  if (phases.length > 0 || appliesTo.length > 0) {
    content += "---\n";
    if (phases.length > 0) {
      content += `phases: [${phases.join(", ")}]\n`;
    }
    if (appliesTo.length > 0) {
      content += `applies_to: [${appliesTo.map((p) => `"${p}"`).join(", ")}]\n`;
    }
    content += "---\n";
  }
  content += ruleText + "\n";

  const filePath = `${root}/${persistence.paths.rulesDir}/${slug}.md`;
  await runtime.fs.mkdir(
    `${root}/${persistence.paths.rulesDir}`,
    {
      recursive: true,
    },
  );
  await runtime.fs.writeTextFile(filePath, content);

  const scope = [];
  if (phases.length > 0) scope.push(phases.join(", "));
  if (appliesTo.length > 0) scope.push(appliesTo.join(", "));
  const scopeLabel = scope.length > 0 ? ` [${scope.join("; ")}]` : "";

  out.writeln(
    span.green("✔"),
    " Rule added: ",
    span.dim(ruleText),
    span.dim(scopeLabel),
  );

  // Auto-sync
  if (config !== null && config.tools.length > 0) {
    await syncEngine.syncAll(root, config.tools, config);
    out.writeln(span.dim("  Tool files synced."));
  }

  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// rule list
// =============================================================================

const ruleList = async (): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
  const rules = await syncEngine.loadScopedRules(root);

  out.writeln(span.bold("Rules"));
  out.writeln("");

  if (rules.length === 0) {
    out.writeln(
      span.dim(
        `  No rules yet. Add one with: ${cmd('rule add "..."')}`,
      ),
    );
  } else {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i]!;
      const scope: string[] = [];
      if (r.phases !== undefined && r.phases.length > 0) {
        scope.push(r.phases.join(", "));
      } else {
        scope.push("all phases");
      }
      if (r.appliesTo !== undefined && r.appliesTo.length > 0) {
        scope.push(r.appliesTo.join(", "));
      } else {
        scope.push("all files");
      }
      out.writeln(
        `  ${i + 1}. ${r.text} `,
        span.dim(`[${scope.join(", ")}]`),
      );
    }
  }

  await out.close();

  return results.ok(undefined);
};

// =============================================================================
// rule promote
// =============================================================================

const rulePromote = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const ruleText = args?.join(" ");

  if (ruleText === undefined || ruleText.length === 0) {
    out.writeln(span.red("Please provide the decision text to promote."));
    await out.close();

    return results.fail({ exitCode: 1 });
  }

  await out.close();

  // Promote = add as rule (same as rule add)
  return await ruleAdd(args);
};
