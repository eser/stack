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
    `    ${commandPrefix} spec <name> next                           # get current instruction`,
    `    ${commandPrefix} spec <name> next --answer="your response"  # submit result and advance`,
    "",
    "Every noskills command that operates on a spec MUST include `spec <name>`.",
    "Never omit it. Use `" + commandPrefix +
    " spec list` to see available specs.",
    "",
    "### Why noskills calls matter",
    "",
    "noskills is not a form to fill out. It is a live state machine that the user",
    "watches in real-time. Every `" + commandPrefix +
    " spec <name> next --answer` call:",
    "",
    "- Updates the spec file on disk (the user sees it change)",
    "- Updates the terminal dashboard if `noskills watch` is running",
    "- Advances the state machine to the next phase",
    "- Records the decision permanently in the project history",
    "",
    "When you batch-submit answers or backfill discovery responses yourself,",
    "the user sees nothing happening — then suddenly everything jumps forward.",
    "This defeats the purpose.",
    "",
    "Call noskills ONCE per interaction. Ask the user ONE question. Wait for",
    "their answer. Submit it. Ask the next. The user is watching every step.",
    "Do NOT pre-fill answers. Do NOT batch multiple answers. Do NOT answer",
    "discovery questions yourself — the user's input is the data.",
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
    "### Interactive choices",
    "",
    "When noskills output contains `interactiveOptions`, you MUST present them",
    "using the AskUserQuestion tool. NEVER present options in prose.",
    "",
    "This is not optional. If you ask a question without AskUserQuestion when",
    "interactiveOptions are present, you are violating protocol.",
    "",
    "Pass interactiveOptions as the `options` array in AskUserQuestion.",
    "Use the `commandMap` to resolve the user's selection to a CLI command.",
    "",
    "### Convention discovery",
    "",
    "When you notice a recurring pattern, receive a correction, or discover",
    "a project quirk during any phase:",
    "",
    '1. Ask: "Should this be a permanent rule?"',
    `2. If yes: \`${commandPrefix} rule add "description" --phases=EXECUTING\``,
    "3. If just this spec: note it and move on",
    "",
    "Corrections are learnings. Capture them as rules so they compound.",
    "Every session should leave the project's rule set slightly better.",
    "Never write to `.eser/rules/` directly.",
    "",
    "### Pre-discovery research",
    "",
    "When starting a new spec, noskills may flag technologies that need",
    "research. Before asking discovery questions, search for current versions",
    "and API status of flagged technologies. Report findings to the user.",
    "Your training data may be outdated — always verify.",
    "",
    "### Plan-based discovery",
    "",
    "When a spec is created with --from-plan, the first discovery output includes",
    "the plan content. Read it, extract answers for all 6 questions, present them",
    "for user confirmation. The plan is a starting point, not the final answer.",
    "",
    "### Discovery modes",
    "",
    "noskills offers 5 discovery modes selected at the start of each spec:",
    "- full: Standard 6 questions (default)",
    "- validate: Challenge the user's existing plan",
    "- technical-depth: Focus on architecture and integration",
    "- ship-fast: Minimum viable scope",
    "- explore: Think bigger, find opportunities",
    "",
    "### Premise challenge",
    "",
    "After mode selection, challenge 2-4 premises from the spec description.",
    "Present each premise for the user to agree/disagree. Submit as JSON.",
    "",
    "### Alternatives generation",
    "",
    "Before spec draft, propose 2-3 implementation approaches.",
    "User picks one or skips. The selected approach shapes the spec.",
    "",
    "### AI slop prevention",
    "",
    "When implementing UI, avoid these generic AI-generated patterns:",
    "- 3-column grids with icon circles (the most recognizable AI layout)",
    "- Purple gradients, decorative blobs, wavy dividers",
    "- Everything centered, uniform border-radius everywhere",
    '- Generic hero copy ("Welcome to...", "Unlock the power of...")',
    "- Cookie-cutter section rhythm",
    "",
    "Every UI element must feel intentional, not generated. If it looks like",
    "every other AI-built site, iterate until it doesn't.",
    "",
    "### Spec splitting",
    "",
    "When noskills suggests splitting a spec, present the options and wait for the",
    "user's decision. Never split a spec without explicit user approval.",
    "",
    "### Decision principle: Explicit > Clever",
    "",
    "You NEVER skip steps, bypass questions, or make assumptions on behalf of the user.",
    "- Discovery questions → ask the user, don't answer yourself",
    "- Classification → ask the user, don't infer",
    "- Spec approval → ask the user, don't auto-approve",
    "- Task refinement → ask the user, don't self-assign",
    "- Rule promotion → ask the user, don't decide",
    'If you think something can be skipped, ASK "would you like to skip this?" — don\'t skip it.',
    "",
    "### Command execution",
    "",
    "When told to run a noskills command, execute it IMMEDIATELY. Do not explore,",
    "research, read source code, or plan first. The command output contains all the",
    "context you need. Exploring noskills internals wastes tokens and delays the user.",
    "",
    "### JSON output",
    "",
    "noskills returns JSON with a `phase` field and phase-specific instructions.",
    "The `meta` block contains resume context - use it to orient yourself,",
    "especially after compaction or at the start of a new session.",
    "Follow the `instruction` field. Use `transition` commands to advance state.",
    "",
    "### Phase progress",
    "",
    "Every noskills output includes a roadmap showing the current phase.",
    "Display it to the user. At critical transitions (approve, start execution),",
    "noskills shows a gate with an explicit action. Present these prominently.",
    "",
    "### Code quality rules",
    "",
    "These rules apply during spec execution:",
    "- After every file edit, run type-check and lint before reporting success",
    "- Files over 500 LOC: read in chunks, never assume single read = full file",
    "- If search returns few results, re-run narrower — assume truncation",
    "- Re-read every file before and after editing",
    "- Before refactoring large files, clean dead code first (separate commit)",
    "",
    "### Execution commitment",
    "",
    "Once a spec enters EXECUTING, complete it. Do not suggest mid-execution",
    'checkpoints, pauses, or "should we stop here?" questions.',
    "",
    "noskills encourages small, meaningful specs defined during discovery.",
    "If a spec is well-scoped, there is no reason to stop halfway — half-done",
    "delivers nothing. If it feels too large mid-execution, that means",
    "discovery should have split it. Finish this one, improve the next.",
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
