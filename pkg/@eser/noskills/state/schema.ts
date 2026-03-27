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

export type ExecutionState = {
  readonly iteration: number;
  readonly lastProgress: string | null;
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
};

export const createInitialState = (): StateFile => ({
  version: "0.1.0",
  phase: "IDLE",
  spec: null,
  branch: null,
  discovery: { answers: [], completed: false },
  specState: { path: null, status: "none" },
  execution: { iteration: 0, lastProgress: null },
  decisions: [],
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
};
