// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * State machine — valid phase transitions and enforcement.
 *
 * @module
 */

import type * as schema from "./schema.ts";
import { paths } from "./persistence.ts";

// =============================================================================
// Transition Map
// =============================================================================

const VALID_TRANSITIONS: Readonly<
  Record<schema.Phase, readonly schema.Phase[]>
> = {
  UNINITIALIZED: ["IDLE"],
  IDLE: ["DISCOVERY"],
  DISCOVERY: ["DISCOVERY_REVIEW"],
  DISCOVERY_REVIEW: ["DISCOVERY_REVIEW", "SPEC_DRAFT"],
  SPEC_DRAFT: ["SPEC_DRAFT", "SPEC_APPROVED"],
  SPEC_APPROVED: ["EXECUTING"],
  EXECUTING: ["DONE", "BLOCKED"],
  BLOCKED: ["EXECUTING"],
  DONE: ["IDLE"],
};

// =============================================================================
// Transition Validation
// =============================================================================

export const canTransition = (
  from: schema.Phase,
  to: schema.Phase,
): boolean => {
  const allowed = VALID_TRANSITIONS[from];

  return allowed.includes(to);
};

export const assertTransition = (
  from: schema.Phase,
  to: schema.Phase,
): void => {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid phase transition: ${from} → ${to}. Allowed: ${
        VALID_TRANSITIONS[from].join(", ")
      }`,
    );
  }
};

// =============================================================================
// State Mutations
// =============================================================================

export const transition = (
  state: schema.StateFile,
  to: schema.Phase,
): schema.StateFile => {
  assertTransition(state.phase, to);

  return { ...state, phase: to };
};

export const startSpec = (
  state: schema.StateFile,
  specName: string,
  branch: string,
): schema.StateFile => {
  assertTransition(state.phase, "DISCOVERY");

  return {
    ...state,
    phase: "DISCOVERY",
    spec: specName,
    branch,
    discovery: {
      answers: [],
      completed: false,
      currentQuestion: 0,
      audience: "human",
    },
    specState: { path: null, status: "none" },
    execution: {
      iteration: 0,
      lastProgress: null,
      modifiedFiles: [],
      lastVerification: null,
      awaitingStatusReport: false,
      debt: null,
      completedTasks: [],
      debtCounter: 0,
      naItems: [],
    },
    decisions: [],
  };
};

export const addDiscoveryAnswer = (
  state: schema.StateFile,
  questionId: string,
  answer: string,
): schema.StateFile => {
  if (state.phase !== "DISCOVERY" && state.phase !== "DISCOVERY_REVIEW") {
    throw new Error(`Cannot add discovery answer in phase: ${state.phase}`);
  }

  const existingAnswers = state.discovery.answers.filter(
    (a) => a.questionId !== questionId,
  );
  const newAnswers = [...existingAnswers, { questionId, answer }];

  return {
    ...state,
    discovery: {
      ...state.discovery,
      answers: newAnswers,
    },
  };
};

export const completeDiscovery = (
  state: schema.StateFile,
): schema.StateFile => {
  if (state.phase !== "DISCOVERY") {
    throw new Error(`Cannot complete discovery in phase: ${state.phase}`);
  }

  return {
    ...state,
    phase: "DISCOVERY_REVIEW",
    discovery: { ...state.discovery, completed: true },
    specState: {
      path: paths.specFile(state.spec!),
      status: "draft",
    },
  };
};

export const approveDiscoveryReview = (
  state: schema.StateFile,
): schema.StateFile => {
  assertTransition(state.phase, "SPEC_DRAFT");

  return {
    ...state,
    phase: "SPEC_DRAFT",
  };
};

export const advanceDiscoveryQuestion = (
  state: schema.StateFile,
): schema.StateFile => {
  if (state.phase !== "DISCOVERY") {
    throw new Error(
      `Cannot advance discovery question in phase: ${state.phase}`,
    );
  }

  return {
    ...state,
    discovery: {
      ...state.discovery,
      currentQuestion: state.discovery.currentQuestion + 1,
    },
  };
};

export const approveSpec = (
  state: schema.StateFile,
): schema.StateFile => {
  assertTransition(state.phase, "SPEC_APPROVED");

  return {
    ...state,
    phase: "SPEC_APPROVED",
    specState: { ...state.specState, status: "approved" },
  };
};

export const startExecution = (
  state: schema.StateFile,
): schema.StateFile => {
  assertTransition(state.phase, "EXECUTING");

  return {
    ...state,
    phase: "EXECUTING",
    // Clear discovery answers — they're persisted in spec.md, no need in state
    discovery: {
      answers: [],
      completed: true,
      currentQuestion: 0,
      audience: "human",
    },
    execution: {
      iteration: 0,
      lastProgress: null,
      modifiedFiles: [],
      lastVerification: null,
      awaitingStatusReport: false,
      debt: null,
      completedTasks: [],
      debtCounter: 0,
      naItems: [],
    },
  };
};

export const advanceExecution = (
  state: schema.StateFile,
  progress: string,
): schema.StateFile => {
  if (state.phase !== "EXECUTING") {
    throw new Error(`Cannot advance execution in phase: ${state.phase}`);
  }

  return {
    ...state,
    execution: {
      ...state.execution,
      iteration: state.execution.iteration + 1,
      lastProgress: progress,
    },
  };
};

export const blockExecution = (
  state: schema.StateFile,
  reason: string,
): schema.StateFile => {
  assertTransition(state.phase, "BLOCKED");

  return {
    ...state,
    phase: "BLOCKED",
    execution: { ...state.execution, lastProgress: `BLOCKED: ${reason}` },
  };
};

export const addDecision = (
  state: schema.StateFile,
  decision: schema.Decision,
): schema.StateFile => {
  return {
    ...state,
    decisions: [...state.decisions, decision],
  };
};

export const resetToIdle = (
  state: schema.StateFile,
): schema.StateFile => {
  return {
    ...state,
    phase: "IDLE",
    spec: null,
    branch: null,
    discovery: {
      answers: [],
      completed: false,
      currentQuestion: 0,
      audience: "human",
    },
    specState: { path: null, status: "none" },
    execution: {
      iteration: 0,
      lastProgress: null,
      modifiedFiles: [],
      lastVerification: null,
      awaitingStatusReport: false,
      debt: null,
      completedTasks: [],
      debtCounter: 0,
      naItems: [],
    },
    decisions: [],
    classification: null,
  };
};
