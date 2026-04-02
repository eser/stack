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
  IDLE: ["DISCOVERY", "COMPLETED"],
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
      planPath: null,
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

export const setDiscoveryMode = (
  state: schema.StateFile,
  mode: schema.DiscoveryMode,
): schema.StateFile => {
  if (state.phase !== "DISCOVERY") {
    throw new Error(`Cannot set discovery mode in phase: ${state.phase}`);
  }
  return {
    ...state,
    discovery: { ...state.discovery, mode },
  };
};

export const completePremises = (
  state: schema.StateFile,
  premises: readonly schema.Premise[],
): schema.StateFile => {
  if (state.phase !== "DISCOVERY") {
    throw new Error(`Cannot complete premises in phase: ${state.phase}`);
  }
  return {
    ...state,
    discovery: { ...state.discovery, premises, premisesCompleted: true },
  };
};

export const selectApproach = (
  state: schema.StateFile,
  approach: schema.SelectedApproach,
): schema.StateFile => {
  if (state.phase !== "DISCOVERY_REVIEW") {
    throw new Error(`Cannot select approach in phase: ${state.phase}`);
  }
  return {
    ...state,
    discovery: {
      ...state.discovery,
      selectedApproach: approach,
      alternativesPresented: true,
    },
  };
};

export const skipAlternatives = (
  state: schema.StateFile,
): schema.StateFile => {
  if (state.phase !== "DISCOVERY_REVIEW") {
    throw new Error(`Cannot skip alternatives in phase: ${state.phase}`);
  }
  return {
    ...state,
    discovery: { ...state.discovery, alternativesPresented: true },
  };
};

export const addDiscoveryAnswer = (
  state: schema.StateFile,
  questionId: string,
  answer: string,
  user?: { name: string; email: string },
): schema.StateFile => {
  if (state.phase !== "DISCOVERY" && state.phase !== "DISCOVERY_REVIEW") {
    throw new Error(`Cannot add discovery answer in phase: ${state.phase}`);
  }

  // Replace existing answer for this question (backward-compatible behavior)
  const existingAnswers = state.discovery.answers.filter(
    (a) => a.questionId !== questionId,
  );

  const newAnswer: schema.AttributedDiscoveryAnswer = {
    questionId,
    answer,
    user: user?.name ?? "Unknown User",
    email: user?.email ?? "",
    timestamp: new Date().toISOString(),
    type: "original",
  };

  return {
    ...state,
    discovery: {
      ...state.discovery,
      answers: [...existingAnswers, newAnswer],
    },
  };
};

/** Add an additional answer to a question without replacing existing ones. */
export const addDiscoveryContribution = (
  state: schema.StateFile,
  questionId: string,
  answer: string,
  user?: { name: string; email: string },
): schema.StateFile => {
  if (state.phase !== "DISCOVERY" && state.phase !== "DISCOVERY_REVIEW") {
    throw new Error(
      `Cannot add discovery contribution in phase: ${state.phase}`,
    );
  }

  const newAnswer: schema.AttributedDiscoveryAnswer = {
    questionId,
    answer,
    user: user?.name ?? "Unknown User",
    email: user?.email ?? "",
    timestamp: new Date().toISOString(),
    type: "addition",
  };

  return {
    ...state,
    discovery: {
      ...state.discovery,
      answers: [...state.discovery.answers, newAnswer],
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

/** Record a phase transition in the history. */
export const recordTransition = (
  state: schema.StateFile,
  from: schema.Phase,
  to: schema.Phase,
  user?: { name: string; email: string },
  reason?: string,
): schema.StateFile => {
  const entry: schema.PhaseTransition = {
    from,
    to,
    user: user?.name ?? "Unknown User",
    email: user?.email ?? "",
    timestamp: new Date().toISOString(),
    reason,
  };

  const history = state.transitionHistory ?? [];
  return {
    ...state,
    transitionHistory: [...history, entry],
  };
};

/** Add a custom acceptance criterion. */
export const addCustomAC = (
  state: schema.StateFile,
  text: string,
  user?: { name: string; email: string },
): schema.StateFile => {
  const existing = state.customACs ?? [];
  const id = `custom-ac-${existing.length + 1}`;

  const ac: schema.CustomAC = {
    id,
    text,
    user: user?.name ?? "Unknown User",
    email: user?.email ?? "",
    timestamp: new Date().toISOString(),
    addedInPhase: state.phase,
  };

  return { ...state, customACs: [...existing, ac] };
};

/** Add a note to the spec. */
export const addSpecNote = (
  state: schema.StateFile,
  text: string,
  user?: { name: string; email: string },
): schema.StateFile => {
  const existing = state.specNotes ?? [];
  const id = `note-${existing.length + 1}`;

  const note: schema.SpecNote = {
    id,
    text,
    user: user?.name ?? "Unknown User",
    email: user?.email ?? "",
    timestamp: new Date().toISOString(),
    phase: state.phase,
  };

  return { ...state, specNotes: [...existing, note] };
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
      planPath: null,
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
