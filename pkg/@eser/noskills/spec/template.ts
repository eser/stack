// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Spec markdown template.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";

// =============================================================================
// Template
// =============================================================================

export const renderSpec = (
  specName: string,
  answers: readonly schema.DiscoveryAnswer[],
  concerns: readonly schema.ConcernDefinition[],
  decisions: readonly schema.Decision[],
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

  // Concern-specific sections
  for (const concern of concerns) {
    if (concern.specSections.length > 0) {
      for (const section of concern.specSections) {
        lines.push(`## ${section} (${concern.id})`);
        lines.push("");
        lines.push("_To be filled in during implementation._");
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

  // Out of Scope (from scope_boundary answer)
  const scopeAnswer = answers.find((a) => a.questionId === "scope_boundary");

  if (scopeAnswer !== undefined) {
    lines.push("## Out of Scope");
    lines.push("");
    lines.push(scopeAnswer.answer);
    lines.push("");
  }

  // Tasks placeholder
  lines.push("## Tasks");
  lines.push("");
  lines.push("_To be broken down during execution._");
  lines.push("");

  // Verification (from verification answer)
  const verificationAnswer = answers.find(
    (a) => a.questionId === "verification",
  );

  lines.push("## Verification");
  lines.push("");
  if (verificationAnswer !== undefined) {
    lines.push(verificationAnswer.answer);
  } else {
    lines.push("_To be defined._");
  }
  lines.push("");

  return lines.join("\n");
};
