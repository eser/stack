// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Discovery questions — the 6 hardcoded questions for v0.1.
 *
 * Each question probes multiple concerns simultaneously.
 * Active project concerns inject additional sub-questions via extras.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import * as concerns from "./concerns.ts";

// =============================================================================
// Question Definition
// =============================================================================

export type Question = {
  readonly id: string;
  readonly text: string;
  readonly concerns: readonly string[];
};

// =============================================================================
// Hardcoded Questions (v0.1)
// =============================================================================

export const QUESTIONS: readonly Question[] = [
  {
    id: "status_quo",
    text: "What does the user do today without this feature?",
    concerns: ["product:status_quo", "eng:replace_scope", "qa:regression_risk"],
  },
  {
    id: "ambition",
    text: "Describe the 1-star and 10-star versions.",
    concerns: [
      "product:scope_direction",
      "eng:complexity_tier",
      "qa:test_depth",
    ],
  },
  {
    id: "reversibility",
    text: "Does this change involve an irreversible decision?",
    concerns: [
      "product:one_way_door",
      "eng:migration_strategy",
      "qa:verification_stringency",
    ],
  },
  {
    id: "user_impact",
    text: "Does this change affect existing users' behavior?",
    concerns: [
      "product:breaking_change",
      "eng:backward_compat",
      "qa:regression_tests",
    ],
  },
  {
    id: "verification",
    text: "How do you verify this works correctly?",
    concerns: [
      "product:success_metric",
      "eng:test_strategy",
      "qa:acceptance_criteria",
    ],
  },
  {
    id: "scope_boundary",
    text: "What should this feature NOT do?",
    concerns: ["product:focus", "eng:out_of_scope", "qa:negative_tests"],
  },
];

// =============================================================================
// Question With Extras
// =============================================================================

export type QuestionWithExtras = Question & {
  readonly extras: readonly schema.ConcernExtra[];
};

/**
 * Built-in extras that are always injected regardless of active concerns.
 * These appear BEFORE any concern-specific extras.
 */
const BUILT_IN_EXTRAS: readonly {
  readonly questionId: string;
  readonly text: string;
}[] = [
  {
    questionId: "verification",
    text: "What tests should be written? (unit, integration, e2e — be specific about what behavior to test)",
  },
  {
    questionId: "verification",
    text: "What documentation needs updating? (README, API docs, CHANGELOG, inline comments)",
  },
];

export const getQuestionsWithExtras = (
  activeConcerns: readonly schema.ConcernDefinition[],
): readonly QuestionWithExtras[] => {
  return QUESTIONS.map((q) => {
    const builtIn = BUILT_IN_EXTRAS.filter((e) => e.questionId === q.id);
    const concernExtras = concerns.getConcernExtras(activeConcerns, q.id);
    return {
      ...q,
      extras: [...builtIn, ...concernExtras],
    };
  });
};

export const getNextUnanswered = (
  questions: readonly QuestionWithExtras[],
  answers: readonly schema.DiscoveryAnswer[],
): QuestionWithExtras | null => {
  const answeredIds = new Set(answers.map((a) => a.questionId));

  for (const q of questions) {
    if (!answeredIds.has(q.id)) {
      return q;
    }
  }

  return null;
};

export const isDiscoveryComplete = (
  answers: readonly schema.DiscoveryAnswer[],
): boolean => {
  const answeredIds = new Set(answers.map((a) => a.questionId));

  return QUESTIONS.every((q) => answeredIds.has(q.id));
};

// =============================================================================
// Answers Submitted Together
// =============================================================================

/** A JSON discovery answer that noskills refuses; the message says why. */
export class DiscoveryAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryAnswerError";
  }
}

/**
 * The base answers a JSON object answer holds, keyed by question id, or null
 * when `answer` is not a JSON object, in which case it answers one question.
 * An empty string leaves its question open. Throws DiscoveryAnswerError for a
 * key that is not a base question id, a value that is not a string, or an
 * object with no answer at all, so a misspelt id is reported instead of
 * stored where nothing reads it.
 */
export const discoveryAnswersOf = (
  answer: string,
): Readonly<Record<string, string>> | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const ids = QUESTIONS.map((q) => q.id);
  const answers: Record<string, string> = {};

  for (const [id, value] of Object.entries(parsed)) {
    if (!ids.includes(id)) {
      throw new DiscoveryAnswerError(
        `Cannot record the discovery answers: "${id}" is not a question id. Key each answer by one of: ${ids.join(
          ", ",
        )}.`,
      );
    }
    if (typeof value !== "string") {
      throw new DiscoveryAnswerError(
        `Cannot record the discovery answers: the answer to "${id}" is not a string. Send each answer as text.`,
      );
    }
    if (value.length > 0) answers[id] = value;
  }

  if (Object.keys(answers).length === 0) {
    throw new DiscoveryAnswerError(
      `Cannot record the discovery answers: the object holds no answer. Key each answer by one of: ${ids.join(
        ", ",
      )}.`,
    );
  }

  return answers;
};

// =============================================================================
// Discovery Stage
// =============================================================================

/**
 * What DISCOVERY asks for next: the user's context ("listen"), the discovery
 * mode ("mode"), the premise challenge ("premises"), or the base questions
 * and their follow-ups ("questions").
 */
export type DiscoveryStage = "listen" | "mode" | "premises" | "questions";

/**
 * The stage a DISCOVERY state is in. `noskills next` compiles its output from
 * it, and the AskUserQuestion hook reads it to tell a base question from the
 * questions asked before them.
 */
export const discoveryStageOf = (state: schema.StateFile): DiscoveryStage => {
  const discovery = state.discovery;
  // A state file written before specDescription existed has no such key.
  const description: unknown = state.specDescription;
  const hasDescription =
    typeof description === "string" && description.length > 0;

  // A new spec with a description and no plan: listen first, then the mode.
  if (
    discovery.mode === undefined &&
    hasDescription &&
    discovery.answers.length === 0 &&
    discovery.planPath === null
  ) {
    const hasUserContext =
      discovery.userContext !== undefined && discovery.userContext.length > 0;

    return hasUserContext ? "mode" : "listen";
  }

  // States from before modes existed have no mode and skip the premises.
  if (
    discovery.mode !== undefined &&
    discovery.premisesCompleted !== true &&
    !isDiscoveryComplete(discovery.answers)
  ) {
    return "premises";
  }

  return "questions";
};
