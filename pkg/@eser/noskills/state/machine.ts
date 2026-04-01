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
  IDLE: ["DISCOVERY", "COMPLETED", "FREE"],
  FREE: ["IDLE"],
  DISCOVERY: ["DISCOVERY_REVIEW", "COMPLETED"],
  DISCOVERY_REVIEW: ["DISCOVERY_REVIEW", "SPEC_DRAFT", "COMPLETED"],
  SPEC_DRAFT: ["SPEC_DRAFT", "SPEC_APPROVED", "COMPLETED"],
  SPEC_APPROVED: ["EXECUTING", "COMPLETED"],
  EXECUTING: ["COMPLETED", "BLOCKED"],
  BLOCKED: ["EXECUTING", "COMPLETED"],
  COMPLETED: ["IDLE", "DISCOVERY"],
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
  description?: string,
): schema.StateFile => {
  assertTransition(state.phase, "DISCOVERY");

  return {
    ...state,
    phase: "DISCOVERY",
    spec: specName,
    specDescription: description ?? null,
    branch,
    discovery: {
      answers: [],
      completed: false,
      currentQuestion: 0,
      audience: "human",
      approved: false,
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

export const enterFreeMode = (
  state: schema.StateFile,
): schema.StateFile => {
  assertTransition(state.phase, "FREE");
  return { ...state, phase: "FREE" };
};

export const exitFreeMode = (
  state: schema.StateFile,
): schema.StateFile => {
  assertTransition(state.phase, "IDLE");
  return { ...state, phase: "IDLE" };
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

/**
 * Approve discovery answers without transitioning to SPEC_DRAFT.
 * Used when a split proposal is detected — stays in DISCOVERY_REVIEW
 * so the user can decide whether to split or keep as one spec.
 */
export const approveDiscoveryAnswers = (
  state: schema.StateFile,
): schema.StateFile => {
  if (state.phase !== "DISCOVERY_REVIEW") {
    throw new Error(
      `Cannot approve discovery answers in phase: ${state.phase}`,
    );
  }

  return {
    ...state,
    discovery: { ...state.discovery, approved: true },
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
    // Preserve discovery answers in state for revisit support
    discovery: {
      ...state.discovery,
      completed: true,
      approved: false,
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

export const completeSpec = (
  state: schema.StateFile,
  reason: schema.CompletionReason,
  note?: string,
): schema.StateFile => {
  assertTransition(state.phase, "COMPLETED");

  return {
    ...state,
    phase: "COMPLETED",
    completionReason: reason,
    completedAt: new Date().toISOString(),
    completionNote: note ?? null,
  };
};

export const reopenSpec = (
  state: schema.StateFile,
): schema.StateFile => {
  if (state.phase !== "COMPLETED") {
    throw new Error(`Cannot reopen in phase: ${state.phase}`);
  }

  return {
    ...state,
    phase: "DISCOVERY",
    reopenedFrom: state.completionReason,
    completionReason: null,
    completedAt: null,
    completionNote: null,
    // Preserve discovery answers for revision
    discovery: {
      ...state.discovery,
      completed: false,
      currentQuestion: 0,
    },
    // Reset execution state
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
    classification: null,
  };
};

/**
 * Revisit a spec — go back from EXECUTING/BLOCKED to DISCOVERY
 * while preserving progress and discovery answers.
 */
export const revisitSpec = (
  state: schema.StateFile,
  reason: string,
): schema.StateFile => {
  if (state.phase !== "EXECUTING" && state.phase !== "BLOCKED") {
    throw new Error(
      `Cannot revisit in phase: ${state.phase}. Only EXECUTING or BLOCKED can revisit.`,
    );
  }

  const entry: schema.RevisitEntry = {
    from: state.phase,
    reason,
    completedTasks: [...state.execution.completedTasks],
    timestamp: new Date().toISOString(),
  };

  return {
    ...state,
    phase: "DISCOVERY",
    // Preserve discovery answers for revision
    discovery: {
      ...state.discovery,
      completed: false,
      currentQuestion: 0,
      approved: false,
    },
    // Reset execution state
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
    classification: null,
    revisitHistory: [...(state.revisitHistory ?? []), entry],
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
      approved: false,
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
    completionReason: null,
    completedAt: null,
    completionNote: null,
    reopenedFrom: null,
  };
};
