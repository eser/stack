// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Spec markdown template.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Split text into list items by line breaks or sentence boundaries.
 * Does NOT split on dots inside filenames, extensions, abbreviations,
 * version numbers, or URLs.
 */
const toBulletList = (text: string): string[] => {
  // Split on line breaks first
  const lines = text.split(/\n/).flatMap((line) =>
    line.trim().length > 0 ? [line.trim()] : []
  );

  if (lines.length > 1) return lines;

  // Single block — split on sentence-ending periods only.
  // A sentence-ending period is followed by space+uppercase letter or EOL.
  // This avoids splitting on ".md", ".ts", "v0.1", "e.g.", "i.e.", URLs, paths.
  return text
    .split(/\.(?=\s+[A-Z])|;\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
};

/**
 * Derive tasks from discovery answers and decisions.
 *
 * SPEC_DRAFT behavioral rule: Auto-generated tasks are a starting point.
 * If any task is still vague (reads like a goal rather than an action), the
 * agent MUST refine it into a concrete imperative before presenting the spec
 * to the user. A good task starts with a verb and describes a single
 * deliverable — e.g. "Add photo upload endpoint with validation".
 */
export const deriveTasks = (
  answers: readonly schema.DiscoveryAnswer[],
  decisions: readonly schema.Decision[] = [],
): string[] => {
  const tasks: string[] = [];

  // -------------------------------------------------------------------------
  // From Q2 (ambition) — extract the implementation goal as ONE task.
  // Q2 describes a spectrum (1-star to 10-star). The target is the highest
  // ambition level described. We do NOT split it into per-star tasks.
  // -------------------------------------------------------------------------
  const ambition = answers.find((a) => a.questionId === "ambition");
  if (ambition !== undefined) {
    const text = ambition.answer;

    // Extract the highest star description as the implementation target
    const tenStarMatch = text.match(/10[- ]?star[:\s]+(.+?)(?:\n|$)/is);
    const fiveStarMatch = text.match(/5[- ]?star[:\s]+(.+?)(?:\n|$)/is);
    const goalText = tenStarMatch !== null
      ? tenStarMatch[1]!.trim()
      : fiveStarMatch !== null
      ? fiveStarMatch[1]!.trim()
      : text.replace(/1[- ]?star[:\s]+[^.]*\.\s*/i, "").trim();

    // Clean: strip leading articles/filler, garbled prefixes
    let cleaned = goalText
      .replace(/^(the|a|an|with|plus|also)\s+/i, "")
      .replace(/^(the\s+)?(target|goal|objective)[:\s]+/i, "")
      .trim();

    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    // Strip trailing period or ellipsis
    cleaned = cleaned.replace(/[.\u2026]+$/, "").trim();

    // Trim to reasonable length without adding prefixes
    if (cleaned.length > 140) {
      cleaned = cleaned.slice(0, 137) + "...";
    }

    if (cleaned.length > 3) {
      tasks.push(cleaned);
    }
  }

  // -------------------------------------------------------------------------
  // From Q5 (verification) — verification tasks, kept whole.
  // These validate the implementation; they do NOT drive it.
  // -------------------------------------------------------------------------
  const verification = answers.find((a) => a.questionId === "verification");
  if (verification !== undefined) {
    // Split on newlines only — keep each criterion whole even with commas or file extensions
    const items = verification.answer
      .split(/\n/)
      .map((s) => s.replace(/^\s*[-\u2022*]\s*/, "").trim())
      .filter((s) => s.length > 0);
    for (const item of items) {
      tasks.push(item);
    }
  }

  // Q6 (scope boundary) items are NOT tasks — they're constraints.
  // They go into behavioral.outOfScope, not the task list.

  // -------------------------------------------------------------------------
  // From decisions — expansion proposals that were accepted become tasks.
  // -------------------------------------------------------------------------
  for (const decision of decisions) {
    const lower = decision.choice.toLowerCase();
    if (lower.includes("accepted") || lower.includes("add to scope")) {
      const taskText = decision.question
        .replace(/^should\s+(we|i)\s+/i, "")
        .replace(/\?+$/, "")
        .trim();
      const capitalized = taskText.charAt(0).toUpperCase() +
        taskText.slice(1);
      tasks.push(capitalized);
    }
  }

  // If no tasks could be derived, prompt the user
  if (tasks.length === 0) {
    tasks.push(
      "_Tasks need to be defined before execution. Add tasks manually or run discovery with more detail._",
    );
  }

  // Always append mandatory test + docs tasks (user can remove during refinement)
  tasks.push("Write or update tests for all new and changed behavior");
  tasks.push(
    "Update documentation for all public-facing changes (README, API docs, CHANGELOG)",
  );

  return tasks;
};

// =============================================================================
// Section relevance check for concerns
// =============================================================================

type SectionRelevance = Record<string, boolean>;

/**
 * Check section relevance using the user-provided classification.
 * No keyword matching — the user already told us what the spec involves.
 * If no classification provided, all sections default to not relevant —
 * a clean spec missing a section is better than one cluttered with irrelevant ones.
 */
const checkSectionRelevance = (
  concern: schema.ConcernDefinition,
  classification: schema.SpecClassification | null,
): SectionRelevance => {
  const relevance: SectionRelevance = {};

  // No classification — default all to not relevant (clean spec)
  if (classification === null) {
    for (const section of concern.specSections) {
      relevance[section] = false;
    }
    return relevance;
  }

  for (const section of concern.specSections) {
    const lower = section.toLowerCase();

    if (
      lower.includes("design") || lower.includes("mobile") ||
      lower.includes("layout") || lower.includes("interaction")
    ) {
      relevance[section] = classification.involvesWebUI;
    } else if (
      lower.includes("contributor") || lower.includes("public api") ||
      lower.includes("api surface")
    ) {
      relevance[section] = classification.involvesPublicAPI;
    } else if (
      lower.includes("migration") || lower.includes("deprecation") ||
      lower.includes("backward") || lower.includes("compatibility")
    ) {
      relevance[section] = classification.involvesMigration;
    } else if (
      lower.includes("audit") || lower.includes("access control") ||
      lower.includes("data handling")
    ) {
      relevance[section] = classification.involvesDataHandling;
    } else {
      relevance[section] = true;
    }
  }

  return relevance;
};

// =============================================================================
// Template
// =============================================================================

export const renderSpec = (
  specName: string,
  answers: readonly schema.DiscoveryAnswer[],
  concerns: readonly schema.ConcernDefinition[],
  decisions: readonly schema.Decision[],
  classification?: schema.SpecClassification | null,
  customACs?: readonly schema.CustomAC[],
  specNotes?: readonly schema.SpecNote[],
  transitionHistory?: readonly schema.PhaseTransition[],
): string => {
  const lines: string[] = [];

  lines.push(`# Spec: ${specName}`);
  lines.push("");
  lines.push("## Status: draft");
  lines.push("");

  if (concerns.length > 0) {
    lines.push(`## Concerns: ${concerns.map((c) => c.id).join(", ")}`);
    lines.push("");
  }

  // Summary from discovery
  lines.push("## Discovery Answers");
  lines.push("");

  for (const answer of answers) {
    lines.push(`### ${answer.questionId}`);
    lines.push("");
    lines.push(answer.answer);
    // Show attribution if available (new format)
    if (
      "user" in answer &&
      (answer as schema.AttributedDiscoveryAnswer).user !== "Unknown User"
    ) {
      const attributed = answer as schema.AttributedDiscoveryAnswer;
      lines.push("");
      lines.push(`_-- ${attributed.user}_`);
    }
    lines.push("");
  }

  // Concern-specific sections — only render relevant ones (skip N/A entirely)
  for (const concern of concerns) {
    if (concern.specSections.length > 0) {
      const relevance = checkSectionRelevance(concern, classification ?? null);

      for (const section of concern.specSections) {
        if (relevance[section] === false) continue; // Skip irrelevant sections

        lines.push(`## ${section} (${concern.id})`);
        lines.push("");
        lines.push("_To be addressed during execution._");
        lines.push("");
      }
    }
  }

  // Decisions
  if (decisions.length > 0) {
    lines.push("## Decisions");
    lines.push("");
    lines.push("| # | Decision | Choice | Promoted |");
    lines.push("|---|----------|--------|----------|");

    for (let i = 0; i < decisions.length; i++) {
      const d = decisions[i]!;
      lines.push(
        `| ${i + 1} | ${d.question} | ${d.choice} | ${
          d.promoted ? "yes" : "no"
        } |`,
      );
    }

    lines.push("");
  }

  // Out of Scope — formatted as bullet list
  const scopeAnswer = answers.find((a) => a.questionId === "scope_boundary");

  if (scopeAnswer !== undefined) {
    lines.push("## Out of Scope");
    lines.push("");
    const items = toBulletList(scopeAnswer.answer);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  // Tasks — auto-derived from discovery answers and accepted decisions
  const tasks = deriveTasks(answers, decisions);
  lines.push("## Tasks");
  lines.push("");
  for (let i = 0; i < tasks.length; i++) {
    lines.push(`- [ ] task-${i + 1}: ${tasks[i]}`);
  }
  lines.push("");

  // Verification (from verification answer)
  const verificationAnswer = answers.find(
    (a) => a.questionId === "verification",
  );

  lines.push("## Verification");
  lines.push("");
  if (verificationAnswer !== undefined) {
    const items = toBulletList(verificationAnswer.answer);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("_To be defined._");
  }
  lines.push("");

  // Custom Acceptance Criteria (multi-user additions)
  const acs = customACs ?? [];
  if (acs.length > 0) {
    lines.push("## Custom Acceptance Criteria");
    lines.push("");
    for (const ac of acs) {
      lines.push(`- ${ac.text} _-- ${ac.user}, ${ac.addedInPhase}_`);
    }
    lines.push("");
  }

  // Notes (multi-user annotations)
  const notes = (specNotes ?? []).filter((n) => !n.text.startsWith("[TASK] "));
  if (notes.length > 0) {
    lines.push("## Notes");
    lines.push("");
    for (const note of notes) {
      lines.push(`- ${note.text} _-- ${note.user}, ${note.phase}_`);
    }
    lines.push("");
  }

  // Phase transition history
  const transitions = transitionHistory ?? [];
  if (transitions.length > 0) {
    lines.push("## Transition History");
    lines.push("");
    lines.push("| From | To | User | Timestamp | Reason |");
    lines.push("|------|----|------|-----------|--------|");
    for (const t of transitions) {
      lines.push(
        `| ${t.from} | ${t.to} | ${t.user} | ${t.timestamp} | ${
          t.reason ?? "-"
        } |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
};
