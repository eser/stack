// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * State schema — types for .nos/.state/state.json and .nos/config.json.
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
  | "BUILDING"
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
// Building
// =============================================================================

export type BuildingState = {
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
// State File (.nos/.state/state.json)
// =============================================================================

export type StateFile = {
  readonly version: string;
  readonly phase: Phase;
  readonly spec: string | null;
  readonly branch: string | null;
  readonly discovery: DiscoveryState;
  readonly specState: SpecState;
  readonly building: BuildingState;
  readonly decisions: readonly Decision[];
};

export const createInitialState = (): StateFile => ({
  version: "0.1.0",
  phase: "IDLE",
  spec: null,
  branch: null,
  discovery: { answers: [], completed: false },
  specState: { path: null, status: "none" },
  building: { iteration: 0, lastProgress: null },
  decisions: [],
});

// =============================================================================
// Config (.nos/config.json)
// =============================================================================

// AI provider IDs — matches @eser/ai provider names
export type ToolId = string;

export type ProjectTraits = {
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly ci: readonly string[];
  readonly testRunner: string | null;
};

export type NosConfig = {
  readonly version: string;
  readonly concerns: readonly string[];
  readonly tools: readonly ToolId[];
  readonly project: ProjectTraits;
};

export const createInitialConfig = (
  concerns: readonly string[],
  tools: readonly ToolId[],
  project: ProjectTraits,
): NosConfig => ({
  version: "0.1.0",
  concerns,
  tools,
  project,
});

// =============================================================================
// Concern Definition (.nos/concerns/*.json)
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
