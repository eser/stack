// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Built-in concern definitions — bootstrapped into .nos/concerns/ during init.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";

// =============================================================================
// Built-in Concerns
// =============================================================================

export const BUILTIN_CONCERNS: readonly schema.ConcernDefinition[] = [
  {
    id: "open-source",
    name: "Open Source",
    description:
      "Community-driven, inclusive, well-documented. Prioritize contributor experience, avoid exclusionary patterns, default to permissive choices.",
    extras: [
      {
        questionId: "status_quo",
        text: "Is this workaround common in the community?",
      },
      {
        questionId: "user_impact",
        text: "Does this make contribution harder?",
      },
    ],
    specSections: ["Contributor Guide", "Public API Surface"],
    reminders: [
      "Endpoint should be documented in API docs",
      "Consider contributor experience for new patterns",
      "Default to permissive, well-documented choices",
    ],
  },
  {
    id: "beautiful-product",
    name: "Beautiful Product",
    description:
      "Design and UX are first-class. Agent critiques UI/UX like a passionate designer. Empty states, error states, loading states, mobile layout — nothing ships unspecified.",
    extras: [
      {
        questionId: "status_quo",
        text: "How painful is the current experience?",
      },
      {
        questionId: "ambition",
        text: "In the 10-star version, what does the user feel?",
      },
    ],
    specSections: [
      "Design States (empty, loading, error, success)",
      "Mobile Layout",
      "Interaction Design",
    ],
    reminders: [
      "Loading state and error state must be designed, not placeholder",
      "No AI slop — every UI element is intentional",
      "Empty states need clear CTAs with examples",
    ],
  },
  {
    id: "long-lived",
    name: "Long-Lived",
    description:
      "Built to last. Stability, maintainability, and backward compatibility matter. Every shortcut needs justification. Favor boring technology.",
    extras: [
      {
        questionId: "reversibility",
        text: "Will this decision still be correct in 2 years?",
      },
      {
        questionId: "scope_boundary",
        text: "What technical debt would this introduce?",
      },
    ],
    specSections: ["Migration & Deprecation", "Backward Compatibility"],
    reminders: [
      "Favor boring technology over shiny new tools",
      "Every shortcut needs explicit justification",
      "Consider maintenance burden for new dependencies",
    ],
  },
  {
    id: "move-fast",
    name: "Move Fast",
    description:
      "Optimize for shipping speed. Acceptable trade-offs on polish. Good enough is good enough. Reduce ceremony.",
    extras: [
      {
        questionId: "scope_boundary",
        text: "Which polish items can be deferred to v2?",
      },
      {
        questionId: "ambition",
        text: "What is the minimum viable 5-star version?",
      },
    ],
    specSections: ["v1 vs v2 Scope"],
    reminders: [
      "Good enough is good enough — ship it",
      "Reduce ceremony, optimize for feedback speed",
      "Mark polish items for v2 explicitly",
    ],
  },
  {
    id: "compliance",
    name: "Compliance",
    description:
      "Audit trails, access controls, data handling rules. Every change is traceable. Verification is mandatory, not optional.",
    extras: [
      {
        questionId: "reversibility",
        text: "Is the audit trail preserved on rollback?",
      },
      {
        questionId: "verification",
        text: "Is there an audit/traceability requirement?",
      },
    ],
    specSections: ["Audit Trail", "Access Control", "Data Handling"],
    reminders: [
      "Every state change must be traceable",
      "Verification is mandatory, not optional",
      "Document data handling and retention policies",
    ],
  },
  {
    id: "learning-project",
    name: "Learning Project",
    description:
      "Experimentation is the goal. Encourage trying new patterns, don't punish dead ends. Document learnings over polish.",
    extras: [
      {
        questionId: "ambition",
        text: "What do you want to learn from building this?",
      },
      {
        questionId: "scope_boundary",
        text: "What experiments are explicitly allowed?",
      },
    ],
    specSections: ["Learning Goals", "Experiment Log"],
    reminders: [
      "Document learnings, not just outcomes",
      "Dead ends are acceptable — document why",
      "Try new patterns freely, polish later",
    ],
  },
];

// =============================================================================
// Concern Operations
// =============================================================================

export const getConcernExtras = (
  concerns: readonly schema.ConcernDefinition[],
  questionId: string,
): readonly schema.ConcernExtra[] => {
  const extras: schema.ConcernExtra[] = [];

  for (const concern of concerns) {
    for (const extra of concern.extras) {
      if (extra.questionId === questionId) {
        extras.push(extra);
      }
    }
  }

  return extras;
};

export const getReminders = (
  concerns: readonly schema.ConcernDefinition[],
): readonly string[] => {
  const reminders: string[] = [];

  for (const concern of concerns) {
    for (const reminder of concern.reminders) {
      reminders.push(`${concern.id}: ${reminder}`);
    }
  }

  return reminders;
};

export type ConcernTension = {
  readonly between: readonly string[];
  readonly issue: string;
};

export const detectTensions = (
  activeConcerns: readonly schema.ConcernDefinition[],
): readonly ConcernTension[] => {
  const tensions: ConcernTension[] = [];
  const ids = activeConcerns.map((c) => c.id);

  if (ids.includes("move-fast") && ids.includes("compliance")) {
    tensions.push({
      between: ["move-fast", "compliance"],
      issue:
        "Speed vs traceability — shortcuts may violate audit requirements.",
    });
  }

  if (ids.includes("move-fast") && ids.includes("long-lived")) {
    tensions.push({
      between: ["move-fast", "long-lived"],
      issue:
        "Shipping speed vs maintainability — tech debt decisions need human approval.",
    });
  }

  if (ids.includes("beautiful-product") && ids.includes("move-fast")) {
    tensions.push({
      between: ["beautiful-product", "move-fast"],
      issue: "Design polish vs speed — which UI states can be deferred?",
    });
  }

  return tensions;
};
