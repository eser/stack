// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Context compiler — builds the minimal JSON output for `noskills next`.
 *
 * Reads state + active concerns + rules → produces the instruction
 * payload that gets printed to stdout for the agent.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import * as questions from "./questions.ts";
import * as concerns from "./concerns.ts";

// =============================================================================
// Output Types (JSON contract for `noskills next`)
// =============================================================================

export type NextOutput =
  | DiscoveryOutput
  | SpecDraftOutput
  | BuildingOutput
  | BlockedOutput
  | DoneOutput
  | IdleOutput;

export type DiscoveryOutput = {
  readonly phase: "DISCOVERY";
  readonly instruction: string;
  readonly question: {
    readonly id: string;
    readonly text: string;
    readonly concerns: readonly string[];
    readonly extras: readonly string[];
  };
  readonly context: ContextBlock;
  readonly transition: {
    readonly onComplete: string;
    readonly remainingQuestions: number;
  };
};

export type SpecDraftOutput = {
  readonly phase: "SPEC_DRAFT";
  readonly instruction: string;
  readonly specPath: string;
  readonly transition: {
    readonly onApprove: string;
  };
};

export type BuildingOutput = {
  readonly phase: "BUILDING";
  readonly instruction: string;
  readonly context: ContextBlock;
  readonly transition: {
    readonly onComplete: string;
    readonly onBlocked: string;
    readonly iteration: number;
  };
  readonly concernTensions?: readonly concerns.ConcernTension[];
};

export type BlockedOutput = {
  readonly phase: "BLOCKED";
  readonly instruction: string;
  readonly reason: string;
  readonly transition: {
    readonly onResolved: string;
  };
};

export type DoneOutput = {
  readonly phase: "DONE";
  readonly summary: {
    readonly spec: string | null;
    readonly iterations: number;
    readonly decisionsCount: number;
  };
};

export type IdleOutput = {
  readonly phase: "IDLE";
  readonly instruction: string;
};

export type ContextBlock = {
  readonly rules: readonly string[];
  readonly concernReminders: readonly string[];
};

// =============================================================================
// Compiler
// =============================================================================

export const compile = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
): NextOutput => {
  switch (state.phase) {
    case "IDLE":
      return compileIdle();
    case "DISCOVERY":
      return compileDiscovery(state, activeConcerns, rules);
    case "SPEC_DRAFT":
      return compileSpecDraft(state);
    case "SPEC_APPROVED":
    case "BUILDING":
      return compileBuilding(state, activeConcerns, rules);
    case "BLOCKED":
      return compileBlocked(state);
    case "DONE":
      return compileDone(state);
    default:
      return compileIdle();
  }
};

// =============================================================================
// Phase Compilers
// =============================================================================

const compileIdle = (): IdleOutput => ({
  phase: "IDLE",
  instruction:
    'No active spec. Start one with: noskills spec new "description"',
});

const compileDiscovery = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
): DiscoveryOutput => {
  const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
  const nextQuestion = questions.getNextUnanswered(
    allQuestions,
    state.discovery.answers,
  );

  if (nextQuestion === null) {
    return {
      phase: "DISCOVERY",
      instruction: "All discovery questions answered. Run: noskills approve",
      question: { id: "", text: "", concerns: [], extras: [] },
      context: { rules, concernReminders: [] },
      transition: { onComplete: "noskills approve", remainingQuestions: 0 },
    };
  }

  const answeredCount = state.discovery.answers.length;
  const totalCount = allQuestions.length;

  return {
    phase: "DISCOVERY",
    instruction: "Ask the user the following question and relay their answer.",
    question: {
      id: nextQuestion.id,
      text: nextQuestion.text,
      concerns: [...nextQuestion.concerns],
      extras: nextQuestion.extras.map((e) => e.text),
    },
    context: {
      rules,
      concernReminders: concerns.getReminders(activeConcerns) as string[],
    },
    transition: {
      onComplete: `noskills next --answer="..."`,
      remainingQuestions: totalCount - answeredCount - 1,
    },
  };
};

const compileSpecDraft = (state: schema.StateFile): SpecDraftOutput => ({
  phase: "SPEC_DRAFT",
  instruction:
    "Spec draft is ready for review. Ask the user to review and approve.",
  specPath: state.specState.path ?? "",
  transition: { onApprove: "noskills approve" },
});

const compileBuilding = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
): BuildingOutput => {
  const tensions = concerns.detectTensions(activeConcerns);

  const output: BuildingOutput = {
    phase: "BUILDING",
    instruction:
      "Read the spec and implement the next task. Report progress when done.",
    context: {
      rules,
      concernReminders: concerns.getReminders(activeConcerns) as string[],
    },
    transition: {
      onComplete: `noskills next --answer="..."`,
      onBlocked: `noskills block "reason"`,
      iteration: state.building.iteration,
    },
  };

  if (tensions.length > 0) {
    return { ...output, concernTensions: tensions };
  }

  return output;
};

const compileBlocked = (state: schema.StateFile): BlockedOutput => ({
  phase: "BLOCKED",
  instruction: "A decision is needed. Ask the user.",
  reason: state.building.lastProgress ?? "Unknown",
  transition: { onResolved: `noskills next --answer="..."` },
});

const compileDone = (state: schema.StateFile): DoneOutput => ({
  phase: "DONE",
  summary: {
    spec: state.spec,
    iterations: state.building.iteration,
    decisionsCount: state.decisions.length,
  },
});
