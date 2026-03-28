// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Claude Code sync — generates/updates CLAUDE.md with noskills instructions.
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";

const NOS_SECTION_START = "<!-- noskills:start -->";
const NOS_SECTION_END = "<!-- noskills:end -->";

export type SyncOptions = {
  readonly allowGit?: boolean;
};

const buildSection = (
  rules: readonly string[],
  options?: SyncOptions,
  commandPrefix = "npx eser noskills",
): string => {
  const lines = [
    NOS_SECTION_START,
    "## noskills orchestrator",
    "",
    "This project uses noskills for state-driven orchestration.",
    "Do NOT read `.eser/rules/`, `.eser/specs/`, or concern files directly.",
    "noskills gives you exactly what you need via JSON output.",
    "",
    "### Protocol",
    "",
    `    ${commandPrefix} next                           # get current instruction`,
    `    ${commandPrefix} next --answer="your response"  # submit result and advance`,
    "",
    "### When to call noskills next",
    "",
    `You MUST call \`${commandPrefix} next\` in these situations:`,
    "",
    "1. At the **START** of every conversation (first thing you do)",
    "2. **BEFORE** creating or modifying any file (to verify you have an active task)",
    "3. **AFTER** completing a logical unit of work (to report progress)",
    "4. When you encounter a **DECISION** that affects architecture or scope",
    "5. When you are **UNSURE** what to do next",
    "",
    "NEVER proceed with implementation without checking noskills first.",
    "NEVER make architectural decisions independently — noskills routes them to the user.",
  ];

  if (!(options?.allowGit ?? false)) {
    lines.push(
      "",
      "### Git is read-only",
      "",
      "You MUST NOT run git write commands: commit, add, push, checkout, stash,",
      "reset, merge, rebase, cherry-pick. The user controls git. You control files.",
      "You MAY read from git: log, diff, status, show, blame.",
    );
  }

  lines.push(
    "",
    "### Convention discovery",
    "",
    "When you discover a pattern, receive a correction, or identify a recurring",
    'preference from the user, ask: "Should this be a permanent rule for this',
    `project, or just for this task?" If permanent, run: \`${commandPrefix} rule add`,
    '"<description>"`. If just this task, note it and move on.',
    "Never write to `.eser/rules/` directly.",
    "",
    "### JSON output",
    "",
    "noskills returns JSON with a `phase` field and phase-specific instructions.",
    "The `meta` block contains resume context - use it to orient yourself,",
    "especially after compaction or at the start of a new session.",
    "Follow the `instruction` field. Use `transition` commands to advance state.",
  );

  if (rules.length > 0) {
    lines.push("", "### Active Rules", "");
    for (const rule of rules) {
      lines.push(`- ${rule}`);
    }
  }

  lines.push(NOS_SECTION_END);

  return lines.join("\n");
};

export const sync = async (
  root: string,
  rules: readonly string[],
  options?: SyncOptions,
  commandPrefix = "npx eser noskills",
): Promise<void> => {
  const filePath = `${root}/CLAUDE.md`;
  const section = buildSection(rules, options, commandPrefix);

  let content: string;

  try {
    content = await runtime.fs.readTextFile(filePath);

    // Replace existing section or append
    const startIdx = content.indexOf(NOS_SECTION_START);
    const endIdx = content.indexOf(NOS_SECTION_END);

    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx) + section +
        content.slice(endIdx + NOS_SECTION_END.length);
    } else {
      content = content.trimEnd() + "\n\n" + section + "\n";
    }
  } catch {
    content = section + "\n";
  }

  await runtime.fs.writeTextFile(filePath, content);
};
