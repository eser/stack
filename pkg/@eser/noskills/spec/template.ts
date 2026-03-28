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
 * Does NOT split on dots inside filenames, extensions, or abbreviations.
 */
const toBulletList = (text: string): string[] => {
  // Split on line breaks first
  const lines = text.split(/\n/).flatMap((line) =>
    line.trim().length > 0 ? [line.trim()] : []
  );

  if (lines.length > 1) return lines;

  // Single block — split on ". " (period+space) or "; " (semicolon+space)
  // This avoids splitting on ".md", ".ts", "v1.", "e.g.", etc.
  return text
    .split(/\.\s+|;\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
};

/** Derive tasks from discovery answers. */
const deriveTasks = (
  answers: readonly schema.DiscoveryAnswer[],
): string[] => {
  const tasks: string[] = [];

  // From Q2 (ambition) — ONE implementation task from the 10-star goal.
  const ambition = answers.find((a) => a.questionId === "ambition");
  if (ambition !== undefined) {
    const text = ambition.answer;
    const tenStarMatch = text.match(/10[- ]?star[:\s]+(.+)/i);
    const goal = tenStarMatch !== null
      ? tenStarMatch[1]!.trim()
      : (text.length > 120 ? text.slice(0, 120) + "..." : text);
    // Clean imperative: capitalize first letter, no prefix
    const cleaned = goal.charAt(0).toUpperCase() + goal.slice(1);
    tasks.push(cleaned);
  }

  // From Q5 (verification) — each criterion as a test task.
  const verification = answers.find((a) => a.questionId === "verification");
  if (verification !== undefined) {
    const items = toBulletList(verification.answer);
    for (const item of items) {
      // Rephrase: "Run X, check Y" → "Test that X" or keep as-is if already imperative
      const lower = item.toLowerCase();
      if (lower.startsWith("run ") || lower.startsWith("check ")) {
        tasks.push(`Test: ${item}`);
      } else {
        tasks.push(item);
      }
    }
  }

  // Q6 (scope boundary) items are NOT tasks — they're constraints.
  // They go into behavioral.outOfScope, not the task list.

  // If no tasks could be derived, prompt the user
  if (tasks.length === 0) {
    tasks.push(
      "_Tasks need to be defined before execution. Add tasks manually or run discovery with more detail._",
    );
  }

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
      relevance[section] = classification.involvesUI;
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

  // Tasks — auto-derived from discovery answers
  const tasks = deriveTasks(answers);
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

  return lines.join("\n");
};
