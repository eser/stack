// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Claude Code sync — generates/updates CLAUDE.md with noskills instructions.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

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
    "State-driven orchestration. Do NOT read `.eser/` files directly — noskills provides everything via JSON.",
    "",
    "### Protocol",
    "",
    `    ${commandPrefix} spec <name> next                           # get instruction`,
    `    ${commandPrefix} spec <name> next --answer="response"       # submit and advance`,
    `    ${commandPrefix} spec new "description"                     # create spec (name auto-generated)`,
    "",
    "Every spec command MUST include `spec <name>`. Use `" + commandPrefix +
    " spec list` for available specs.",
    "",
    "### Core rules",
    "",
    "- Call noskills ONCE per interaction. One question, one answer, one submit.",
    "- Call `next` at: conversation start, before file edits, after completing work, at decisions.",
    "- Never batch-submit. Never answer discovery questions yourself.",
    "- Never skip steps or infer decisions. Ask first. Explicit > Clever.",
    "- NEVER suggest bypassing or skipping noskills. Discovery is not overhead.",
    "- NEVER ask permission to run the next noskills command. After spec new → run next. After approve → run next. Each step has one next step. Just run it.",
    "- Execute noskills commands IMMEDIATELY — the output has all context needed.",
    "- Display `roadmap` before content. Display `gate` prominently.",
    "",
    "### Interactive choices",
    "",
    "- Use AskUserQuestion for `interactiveOptions`. Use `commandMap` to resolve selections.",
    "- On recurring patterns or corrections: ask 'Permanent rule?' → `" +
    commandPrefix + ' rule add "description"`.',
  ];

  if (!(options?.allowGit ?? false)) {
    lines.push(
      "",
      "### Git",
      "",
      "Read-only: log, diff, status, show, blame. No write commands (commit, push, checkout, etc.).",
    );
  }

  lines.push(
    "",
    "### Spec Creation",
    "",
    "When the user wants a spec:",
    '1. Ask "What do you want to build?" — nothing else.',
    "2. Take their full answer as the description.",
    `3. Run: ${commandPrefix} spec new "their answer"`,
    "Do NOT suggest names. Do NOT analyze before creating. Just ask, take the answer, create.",
    "",
    "### Concern Management",
    "",
    `When user says "add concerns" or "manage concerns":`,
    `- Run \`${commandPrefix} concern list\` immediately. Do NOT analyze which concerns are appropriate.`,
    "- Present list via AskUserQuestion with multiSelect:true, max 4 options per question.",
    `- Add all selected concerns in ONE command: ${commandPrefix} concern add open-source well-engineered long-lived`,
    "",
    "### Discovery",
    "",
    "Listen first: after spec creation, ask user to share context before mode selection.",
    "Modes: full (default), validate, technical-depth, ship-fast, explore.",
    "Pre-scan codebase before questions. Challenge premises. Propose alternatives.",
    "With --from-plan: extract answers, present for user confirmation.",
    "",
    "### Mode Management",
    "",
    "noskills manages Claude Code plan mode transitions automatically.",
    "Follow the `modeDirective` field in each `noskills next` output.",
    "",
    "| Phase | Mode |",
    "|-------|------|",
    "| IDLE | plan mode optional — no active spec |",
    "| DISCOVERY, DISCOVERY_REFINEMENT, SPEC_PROPOSAL | **plan mode** — read-only, no file edits |",
    "| EXECUTING | **normal mode** — full write access for sub-agents |",
    "| BLOCKED | **plan mode** — analyze the blocker, do not edit |",
    "| COMPLETED | plan mode optional |",
    "",
    "Non-Claude-Code platforms: `modeDirective` is advisory. Hooks enforce file restrictions mechanically.",
    "",
    "### Execution",
    "",
    "- Re-read files before and after editing. Files >500 LOC: read in chunks.",
    "- Run type-check + lint after every edit. Never mark AC passed if type-check fails.",
    "- If search returns few results, re-run narrower — assume truncation.",
    "- Clean dead code before structural refactors on files >300 LOC.",
    "- Complete the spec — no mid-execution pauses or checkpoints.",
    "- `meta` block has resume context for session start or after compaction.",
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
