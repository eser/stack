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
  // From Q2 (ambition) — extract individual features from the 10-star goal.
  // -------------------------------------------------------------------------
  const ambition = answers.find((a) => a.questionId === "ambition");
  if (ambition !== undefined) {
    const text = ambition.answer;
    const tenStarMatch = text.match(/10[- ]?star[:\s]+(.+)/i);
    const goalText = tenStarMatch !== null ? tenStarMatch[1]!.trim() : text;

    // Split by sentences (newlines or ". "), NOT by commas.
    // Commas are part of task descriptions, not delimiters.
    const goalLines = goalText.split(/\n/).map((s) => s.trim()).filter((s) =>
      s.length > 0
    );
    let fragments: string[];
    if (goalLines.length > 1) {
      fragments = goalLines.map((s) =>
        s.replace(/^\s*[-\u2022*]\s*/, "").trim()
      )
        .filter((s) => s.length > 3);
    } else {
      // Single block — split on sentence boundaries (period + space)
      fragments = goalText
        .split(/\.\s+/)
        .map((s) => s.replace(/^\s*[-\u2022*]\s*/, "").trim())
        .filter((s) => s.length > 3);
    }

    for (const raw of fragments) {
      // Clean: strip leading articles/filler, capitalize, ensure imperative
      let cleaned = raw
        .replace(/^(the|a|an|with|plus|also)\s+/i, "")
        .trim();

      // Strip garbled prefixes like "the target:", "the goal:"
      cleaned = cleaned.replace(
        /^(the\s+)?(target|goal|objective)[:\s]+/i,
        "",
      ).trim();

      // Capitalize first letter
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

      // Strip trailing period or ellipsis
      cleaned = cleaned.replace(/[.\u2026]+$/, "").trim();

      // If still vague (too long and no leading verb), prefix with "Implement"
      const hasVerb = /^[A-Z][a-z]+\s/.test(cleaned) &&
        /^(Add|Create|Build|Implement|Set up|Configure|Enable|Update|Remove|Refactor|Extract|Fix|Write|Design|Integrate|Support|Replace|Migrate)\s/i
          .test(cleaned);

      if (cleaned.length > 100 && !hasVerb) {
        cleaned = `Implement ${cleaned.charAt(0).toLowerCase()}${
          cleaned.slice(1)
        }`;
        // Trim to a reasonable length
        if (cleaned.length > 140) {
          cleaned = cleaned.slice(0, 137) + "...";
        }
      }

      if (cleaned.length > 3) {
        tasks.push(cleaned);
      }
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

  return lines.join("\n");
};
