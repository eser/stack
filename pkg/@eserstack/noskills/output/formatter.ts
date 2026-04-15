// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Output formatter — serializes structured data to json, markdown, or text.
 *
 * The compiler returns structured objects. This module is the last step
 * before stdout — everything upstream is format-agnostic.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

export type OutputFormat = "json" | "markdown" | "text";

// =============================================================================
// Arg Parsing
// =============================================================================

/** Extract -o / --output flag from args. Returns "json" if not specified. */
export const parseOutputFormat = (
  args?: readonly string[],
): OutputFormat => {
  if (args === undefined) return "json";

  for (const arg of args) {
    if (arg === "-o" || arg.startsWith("--output")) {
      // Handle: -o json, -o markdown, -o text
      // or: --output=json, --output=markdown
      const idx = args.indexOf(arg);

      if (arg.includes("=")) {
        return normalizeFormat(arg.split("=")[1] ?? "json");
      }

      // Next arg is the format
      const next = args[idx + 1];

      if (next !== undefined && !next.startsWith("-")) {
        return normalizeFormat(next);
      }
    }
  }

  return "json";
};

/** Strip -o and its value from args so downstream parsers don't see them. */
export const stripOutputFlag = (
  args?: readonly string[],
): readonly string[] => {
  if (args === undefined) return [];

  const result: string[] = [];
  let skipNext = false;

  for (let i = 0; i < args.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    const arg = args[i]!;

    if (arg.startsWith("--output=")) continue;
    if (arg === "-o" || arg === "--output") {
      skipNext = true;
      continue;
    }

    result.push(arg);
  }

  return result;
};

const normalizeFormat = (raw: string): OutputFormat => {
  const lower = raw.toLowerCase();
  if (lower === "md" || lower === "markdown") return "markdown";
  if (lower === "text" || lower === "txt" || lower === "plain") return "text";
  return "json";
};

// =============================================================================
// Safe property accessor for Record<string, unknown>
// =============================================================================

const get = <T>(obj: Record<string, unknown>, key: string): T | undefined =>
  obj[key] as T | undefined;

// =============================================================================
// JSON formatter (default — for agents and pipes)
// =============================================================================

const formatJson = (data: unknown): string => {
  return JSON.stringify(data, null, 2);
};

// =============================================================================
// Markdown formatter (human-readable)
// =============================================================================

const formatMarkdown = (data: unknown): string => {
  const obj = data as Record<string, unknown>;
  const lines: string[] = [];

  const phase = get<string>(obj, "phase");
  if (phase !== undefined) {
    lines.push(`# noskills — ${phase}`);
    lines.push("");
  }

  const instruction = get<string>(obj, "instruction");
  if (instruction !== undefined) {
    lines.push("## Instruction");
    lines.push("");
    lines.push(instruction);
    lines.push("");
  }

  // Discovery questions (batched array)
  const questions = get<{ id: string; text: string; extras?: string[] }[]>(
    obj,
    "questions",
  );
  if (questions !== undefined && questions.length > 0) {
    for (const q of questions) {
      lines.push(`## Question: ${q.id}`);
      lines.push("");
      lines.push(`> ${q.text}`);
      if (q.extras !== undefined && q.extras.length > 0) {
        lines.push("");
        lines.push("Also consider:");
        for (const e of q.extras) {
          lines.push(`- ${e}`);
        }
      }
      lines.push("");
    }
  }

  const statusReport = get<{ criteria: string[] }>(obj, "statusReport");
  if (statusReport !== undefined) {
    lines.push("## Acceptance Criteria");
    lines.push("");
    for (const c of statusReport.criteria) {
      lines.push(`- [ ] ${c}`);
    }
    lines.push("");
  }

  const debt = get<{ fromIteration: number; items: string[]; note: string }>(
    obj,
    "previousIterationDebt",
  );
  if (debt !== undefined) {
    lines.push(`## Debt (from iteration ${debt.fromIteration})`);
    lines.push("");
    lines.push(`> ${debt.note}`);
    lines.push("");
    for (const item of debt.items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (get<boolean>(obj, "verificationFailed") === true) {
    lines.push("## Verification FAILED");
    lines.push("");
    lines.push("```");
    lines.push(String(get<string>(obj, "verificationOutput") ?? ""));
    lines.push("```");
    lines.push("");
  }

  const behavioral = get<{ rules: string[]; tone: string; urgency?: string }>(
    obj,
    "behavioral",
  );
  if (behavioral !== undefined) {
    lines.push("## Behavioral");
    lines.push("");
    lines.push(`**Tone:** ${behavioral.tone}`);
    lines.push("");
    for (const r of behavioral.rules) {
      lines.push(`- ${r}`);
    }
    if (behavioral.urgency !== undefined) {
      lines.push("");
      lines.push(`**Urgency:** ${behavioral.urgency}`);
    }
    lines.push("");
  }

  const meta = get<{ resumeHint: string }>(obj, "meta");
  if (meta !== undefined) {
    lines.push("---");
    lines.push("");
    lines.push(`*${meta.resumeHint}*`);
    lines.push("");
  }

  const transition = get<Record<string, unknown>>(obj, "transition");
  if (transition !== undefined) {
    lines.push("## Next Steps");
    lines.push("");
    for (const [key, value] of Object.entries(transition)) {
      if (key !== "iteration") {
        lines.push(`- **${key}:** \`${value}\``);
      }
    }
    lines.push("");
  }

  const summary = get<{
    spec: string;
    iterations: number;
    decisionsCount: number;
  }>(obj, "summary");
  if (summary !== undefined) {
    lines.push("## Summary");
    lines.push("");
    lines.push(`- Spec: ${summary.spec}`);
    lines.push(`- Iterations: ${summary.iterations}`);
    lines.push(`- Decisions: ${summary.decisionsCount}`);
    lines.push("");
  }

  const clearCtx = get<{ reason: string }>(obj, "clearContext");
  if (clearCtx !== undefined) {
    lines.push("---");
    lines.push("");
    lines.push(`**Action required:** ${clearCtx.reason}`);
    lines.push("");
  }

  return lines.join("\n");
};

// =============================================================================
// Text formatter (plain, no formatting)
// =============================================================================

const formatText = (data: unknown): string => {
  const obj = data as Record<string, unknown>;
  const lines: string[] = [];

  const phase = get<string>(obj, "phase");
  if (phase !== undefined) {
    lines.push(`[${phase}]`);
  }

  const instruction = get<string>(obj, "instruction");
  if (instruction !== undefined) {
    lines.push(instruction);
  }

  const questions = get<{ id: string; text: string; extras?: string[] }[]>(
    obj,
    "questions",
  );
  if (questions !== undefined && questions.length > 0) {
    for (const q of questions) {
      lines.push("");
      lines.push(`Question [${q.id}]: ${q.text}`);
      if (q.extras !== undefined) {
        for (const e of q.extras) {
          lines.push(`  - ${e}`);
        }
      }
    }
  }

  const statusReport = get<{ criteria: string[] }>(obj, "statusReport");
  if (statusReport !== undefined) {
    lines.push("");
    lines.push("Criteria:");
    for (const c of statusReport.criteria) {
      lines.push(`  - ${c}`);
    }
  }

  const debt = get<{ items: string[]; note: string }>(
    obj,
    "previousIterationDebt",
  );
  if (debt !== undefined) {
    lines.push("");
    lines.push(debt.note);
    for (const item of debt.items) {
      lines.push(`  - ${item}`);
    }
  }

  if (get<boolean>(obj, "verificationFailed") === true) {
    lines.push("");
    lines.push(
      `Verification failed: ${
        String(get<string>(obj, "verificationOutput") ?? "").slice(0, 200)
      }`,
    );
  }

  const meta = get<{ resumeHint: string }>(obj, "meta");
  if (meta !== undefined) {
    lines.push("");
    lines.push(meta.resumeHint);
  }

  const summary = get<{
    spec: string;
    iterations: number;
    decisionsCount: number;
  }>(obj, "summary");
  if (summary !== undefined) {
    lines.push(
      `Spec: ${summary.spec}, Iterations: ${summary.iterations}, Decisions: ${summary.decisionsCount}`,
    );
  }

  const clearCtx = get<{ reason: string }>(obj, "clearContext");
  if (clearCtx !== undefined) {
    lines.push("");
    lines.push(clearCtx.reason);
  }

  return lines.join("\n");
};

// =============================================================================
// Format dispatch
// =============================================================================

export const format = (data: unknown, fmt: OutputFormat): string => {
  switch (fmt) {
    case "markdown":
      return formatMarkdown(data);
    case "text":
      return formatText(data);
    default:
      return formatJson(data);
  }
};

// =============================================================================
// Write to stdout
// =============================================================================

export const writeFormatted = async (
  data: unknown,
  fmt: OutputFormat,
): Promise<void> => {
  const text = format(data, fmt);
  const encoder = new TextEncoder();
  const writer = runtime.process.stdout.getWriter();
  await writer.write(encoder.encode(text + "\n"));
  writer.releaseLock();
};
