// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * State schema — types for .eser/.state/state.json and .eser/manifest.yml.
 *
 * @module
 */

// =============================================================================
// Phases
// =============================================================================

export type Phase =
  | "UNINITIALIZED"
  | "IDLE"
  | "DISCOVERY"
  | "SPEC_DRAFT"
  | "SPEC_APPROVED"
  | "EXECUTING"
  | "BLOCKED"
  | "DONE";

// =============================================================================
// Discovery
// =============================================================================

export type DiscoveryAnswer = {
  readonly questionId: string;
  readonly answer: string;
};

export type DiscoveryState = {
  readonly answers: readonly DiscoveryAnswer[];
  readonly completed: boolean;
};

// =============================================================================
// Spec
// =============================================================================

export type SpecState = {
  readonly path: string | null;
  readonly status: "none" | "draft" | "approved";
};

// =============================================================================
// Execution
// =============================================================================

export type VerificationResult = {
  readonly passed: boolean;
  readonly output: string;
  readonly timestamp: string;
};

export type StatusReport = {
  readonly completed: readonly string[];
  readonly remaining: readonly string[];
  readonly blocked: readonly string[];
  readonly iteration: number;
  readonly timestamp: string;
};

export type DebtState = {
  readonly items: readonly string[];
  readonly fromIteration: number;
  readonly unaddressedIterations: number;
};

export type SpecTask = {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
};

export type SpecClassification = {
  readonly involvesUI: boolean;
  readonly involvesPublicAPI: boolean;
  readonly involvesMigration: boolean;
  readonly involvesDataHandling: boolean;
};

export type ExecutionState = {
  readonly iteration: number;
  readonly lastProgress: string | null;
  readonly modifiedFiles: readonly string[];
  readonly lastVerification: VerificationResult | null;
  readonly awaitingStatusReport: boolean;
  readonly debt: DebtState | null;
  readonly completedTasks: readonly string[];
};

// =============================================================================
// Decision
// =============================================================================

export type Decision = {
  readonly id: string;
  readonly question: string;
  readonly choice: string;
  readonly promoted: boolean;
  readonly timestamp: string;
};

// =============================================================================
// State File (.eser/.state/state.json)
// =============================================================================

export type StateFile = {
  readonly version: string;
  readonly phase: Phase;
  readonly spec: string | null;
  readonly branch: string | null;
  readonly discovery: DiscoveryState;
  readonly specState: SpecState;
  readonly execution: ExecutionState;
  readonly decisions: readonly Decision[];
  readonly lastCalledAt: string | null;
  readonly pendingClear: boolean;
  readonly classification: SpecClassification | null;
};

export const createInitialState = (): StateFile => ({
  version: "0.1.0",
  phase: "IDLE",
  spec: null,
  branch: null,
  discovery: { answers: [], completed: false },
  specState: { path: null, status: "none" },
  execution: {
    iteration: 0,
    lastProgress: null,
    modifiedFiles: [],
    lastVerification: null,
    awaitingStatusReport: false,
    debt: null,
    completedTasks: [],
  },
  decisions: [],
  lastCalledAt: null,
  pendingClear: false,
  classification: null,
});

// =============================================================================
// Config (noskills section in .eser/manifest.yml)
// =============================================================================

// AI provider IDs — matches @eser/ai provider names
export type ToolId = string;

export type ProjectTraits = {
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly ci: readonly string[];
  readonly testRunner: string | null;
};

export type CodingToolId =
  | "claude-code"
  | "cursor"
  | "kiro"
  | "copilot"
  | "windsurf";

export type NosManifest = {
  readonly concerns: readonly string[];
  readonly tools: readonly CodingToolId[];
  readonly providers: readonly ToolId[];
  readonly project: ProjectTraits;
  readonly maxIterationsBeforeRestart: number;
  readonly verifyCommand: string | null;
  readonly allowGit: boolean;
};

export const createInitialManifest = (
  concerns: readonly string[],
  tools: readonly CodingToolId[],
  providers: readonly ToolId[],
  project: ProjectTraits,
): NosManifest => ({
  concerns,
  tools,
  providers,
  project,
  maxIterationsBeforeRestart: 15,
  verifyCommand: null,
  allowGit: false,
});

// =============================================================================
// Concern Definition (.eser/concerns/*.json)
// =============================================================================

export type ConcernExtra = {
  readonly questionId: string;
  readonly text: string;
};

export type ConcernDefinition = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extras: readonly ConcernExtra[];
  readonly specSections: readonly string[];
  readonly reminders: readonly string[];
  readonly acceptanceCriteria: readonly string[];
};
