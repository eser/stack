// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills learn` — Manage cross-session learnings.
 * `noskills spec <name> learn "text"` — Add a learning from a spec.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as learnings from "../dashboard/learnings.ts";
import * as syncEngine from "../sync/engine.ts";
import { runtime } from "@eser/standards/cross-runtime";

/** Create a rule file from text. Returns the file path. */
const createRuleFile = async (
  root: string,
  text: string,
  sourceSpec: string,
): Promise<string> => {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  const content =
    `---\nphases: [EXECUTING]\nsource: learned from spec "${sourceSpec}" on ${
      new Date().toISOString().slice(0, 10)
    }\n---\n${text}\n`;

  const filePath = `${root}/${persistence.paths.rulesDir}/${slug}.md`;
  await runtime.fs.mkdir(`${root}/${persistence.paths.rulesDir}`, {
    recursive: true,
  });
  await runtime.fs.writeTextFile(filePath, content);

  return filePath;
};

/** Detect if text sounds like a permanent rule. */
const looksLikeRule = (text: string): boolean => {
  const lower = text.toLowerCase();
  return lower.includes("always ") || lower.includes("never ") ||
    lower.includes("every time") || lower.includes("must ") ||
    lower.includes("do not ") || lower.startsWith("use ") ||
    lower.includes("convention:") || lower.includes("rule:");
};

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
  const sub = args?.[0];

  // noskills learn list
  if (sub === "list" || sub === undefined) {
    const all = await learnings.readLearnings(root);

    if (all.length === 0) {
      out.writeln(span.dim("No learnings recorded yet."));
      await out.close();
      return results.ok(undefined);
    }

    out.writeln(span.bold(`${all.length} learning(s):`));
    out.writeln("");

    for (let i = 0; i < all.length; i++) {
      const l = all[i]!;
      const icon = l.type === "mistake"
        ? span.red("\u26A0")
        : span.green("\u2713");
      const typeLabel = span.dim(`[${l.type}]`);
      const severity = l.severity === "high"
        ? span.red("HIGH")
        : span.dim(l.severity);

      out.writeln(`  ${i + 1}. ${icon} ${typeLabel} ${l.text}`);
      out.writeln(
        span.dim(`     spec: ${l.spec} | severity: `),
        severity,
        span.dim(` | ${l.ts.slice(0, 10)}`),
      );
    }

    await out.close();
    return results.ok(undefined);
  }

  // noskills learn remove <index>
  if (sub === "remove") {
    const idx = parseInt(args?.[1] ?? "", 10) - 1;
    if (isNaN(idx) || idx < 0) {
      out.writeln(span.red("Usage: noskills learn remove <number>"));
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    const removed = await learnings.removeLearning(root, idx);
    if (removed) {
      out.writeln(span.green("\u2714"), ` Removed learning #${idx + 1}`);
    } else {
      out.writeln(span.red(`Learning #${idx + 1} not found`));
    }
    await out.close();
    return results.ok(undefined);
  }

  // noskills learn promote <index>
  if (sub === "promote") {
    const idx = parseInt(args?.[1] ?? "", 10) - 1;
    if (isNaN(idx) || idx < 0) {
      out.writeln(span.red("Usage: noskills learn promote <number>"));
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    const all = await learnings.readLearnings(root);
    if (idx >= all.length) {
      out.writeln(span.red(`Learning #${idx + 1} not found`));
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    const learning = all[idx]!;
    const filePath = await createRuleFile(root, learning.text, learning.spec);
    await learnings.removeLearning(root, idx);

    // Auto-sync
    const config = await persistence.readManifest(root);
    if (config !== null && config.tools.length > 0) {
      await syncEngine.syncAll(root, config.tools, config);
    }

    out.writeln(span.green("\u2714"), ` Promoted to rule: ${filePath}`);
    out.writeln(span.dim("  Removed from learnings."));
    await out.close();
    return results.ok(undefined);
  }

  // noskills spec <name> learn "text" [--rule]
  const specResult = persistence.parseSpecFlag(args);
  const isRule = (args ?? []).includes("--rule");
  const positionals = (args ?? []).filter((a) => !a.startsWith("--"));
  const text = positionals.join(" ");

  if (text.length === 0) {
    out.writeln(
      span.red('Usage: noskills spec <name> learn "learning text"'),
    );
    out.writeln(
      span.dim("  Add --rule to create a permanent project rule instead."),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const specName = specResult ?? "unknown";

  // --rule flag: create rule directly
  if (isRule) {
    const filePath = await createRuleFile(root, text, specName);
    const config = await persistence.readManifest(root);
    if (config !== null && config.tools.length > 0) {
      await syncEngine.syncAll(root, config.tools, config);
    }

    out.writeln(span.green("\u2714"), ` Rule created: ${filePath}`);
    await out.close();
    return results.ok(undefined);
  }

  // Auto-detect type
  let type: learnings.LearningType = "convention";
  let severity: "high" | "medium" | "low" = "medium";
  for (const arg of args ?? []) {
    if (arg.startsWith("--type=")) {
      const t = arg.slice("--type=".length);
      if (["mistake", "convention", "success", "dependency"].includes(t)) {
        type = t as learnings.LearningType;
      }
    }
    if (arg.startsWith("--severity=")) {
      const s = arg.slice("--severity=".length);
      if (["high", "medium", "low"].includes(s)) {
        severity = s as "high" | "medium" | "low";
      }
    }
  }

  const lower = text.toLowerCase();
  if (
    lower.includes("mistake") || lower.includes("wrong") ||
    lower.includes("assumed")
  ) {
    type = "mistake";
    severity = "high";
  } else if (
    lower.includes("convention") || lower.includes("pattern") ||
    lower.includes("always use")
  ) {
    type = "convention";
  } else if (lower.includes("worked well") || lower.includes("success")) {
    type = "success";
  }

  await learnings.addLearning(root, {
    ts: new Date().toISOString(),
    spec: specName,
    type,
    text,
    severity,
  });

  // Suggest promotion if it looks like a rule
  const suggestion = looksLikeRule(text)
    ? span.dim(
      "\n  Tip: This sounds like a permanent rule. Add --rule to enforce it in every spec.",
    )
    : "";

  out.writeln(
    span.green("\u2714"),
    ` Learning recorded: [${type}] ${text.slice(0, 60)}${
      text.length > 60 ? "..." : ""
    }`,
  );
  if (suggestion) out.writeln(suggestion);
  await out.close();
  return results.ok(undefined);
};
