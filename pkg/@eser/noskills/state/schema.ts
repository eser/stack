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
  | "DISCOVERY_REVIEW"
  | "SPEC_DRAFT"
  | "SPEC_APPROVED"
  | "EXECUTING"
  | "BLOCKED"
  | "COMPLETED";

export type CompletionReason = "done" | "cancelled" | "wontfix";

export type DiscoveryMode =
  | "full"
  | "validate"
  | "technical-depth"
  | "ship-fast"
  | "explore";

// =============================================================================
// Discovery
// =============================================================================

export type DiscoveryAnswer = {
  readonly questionId: string;
  readonly answer: string;
};

// Extended discovery answer with attribution (new format — old format still works)
export type AttributedDiscoveryAnswer = {
  readonly questionId: string;
  readonly answer: string;
  readonly user: string;
  readonly email: string;
  readonly timestamp: string;
  readonly type: "original" | "addition" | "revision";
};

export type Premise = {
  readonly text: string;
  readonly agreed: boolean;
  readonly revision?: string;
  readonly user: string;
  readonly timestamp: string;
};

export type SelectedApproach = {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly effort: string;
  readonly risk: string;
  readonly user: string;
  readonly timestamp: string;
};

export type PhaseTransition = {
  readonly from: Phase;
  readonly to: Phase;
  readonly user: string;
  readonly email: string;
  readonly timestamp: string;
  readonly reason?: string;
};

export type CustomAC = {
  readonly id: string;
  readonly text: string;
  readonly user: string;
  readonly email: string;
  readonly timestamp: string;
  readonly addedInPhase: Phase;
};

export type SpecNote = {
  readonly id: string;
  readonly text: string;
  readonly user: string;
  readonly email: string;
  readonly timestamp: string;
  readonly phase: Phase;
};

export type DiscoveryState = {
  readonly answers: readonly DiscoveryAnswer[];
  readonly completed: boolean;
  readonly currentQuestion: number;
  readonly audience: "agent" | "human";
  readonly approved: boolean;
  readonly planPath: string | null;
  readonly mode?: DiscoveryMode;
  readonly premises?: readonly Premise[];
  readonly selectedApproach?: SelectedApproach;
  readonly premisesCompleted?: boolean;
  readonly alternativesPresented?: boolean;
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

export type DebtItem = {
  readonly id: string;
  readonly text: string;
  readonly since: number;
};

export type DebtState = {
  readonly items: readonly DebtItem[];
  readonly fromIteration: number; // kept for backward compat, prefer item.since
  readonly unaddressedIterations: number;
};

export type SpecTask = {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
};

export type SpecClassification = {
  readonly involvesWebUI: boolean;
  readonly involvesCLI: boolean;
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
  readonly debtCounter: number;
  readonly naItems: readonly string[];
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
// Revisit History
// =============================================================================

export type RevisitEntry = {
  readonly from: Phase;
  readonly reason: string;
  readonly completedTasks: readonly string[];
  readonly timestamp: string;
};

// =============================================================================
// State File (.eser/.state/state.json)
// =============================================================================

export type StateFile = {
  readonly version: string;
  readonly phase: Phase;
  readonly spec: string | null;
  readonly specDescription: string | null;
  readonly branch: string | null;
  readonly discovery: DiscoveryState;
  readonly specState: SpecState;
  readonly execution: ExecutionState;
  readonly decisions: readonly Decision[];
  readonly lastCalledAt: string | null;
  readonly classification: SpecClassification | null;
  readonly completionReason: CompletionReason | null;
  readonly completedAt: string | null;
  readonly completionNote: string | null;
  readonly reopenedFrom: string | null;
  readonly revisitHistory: readonly RevisitEntry[];
  readonly transitionHistory?: readonly PhaseTransition[];
  readonly customACs?: readonly CustomAC[];
  readonly specNotes?: readonly SpecNote[];
};

export const createInitialState = (): StateFile => ({
  version: "0.1.0",
  phase: "IDLE",
  spec: null,
  specDescription: null,
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
  lastCalledAt: null,
  classification: null,
  completionReason: null,
  completedAt: null,
  completionNote: null,
  reopenedFrom: null,
  revisitHistory: [],
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
  | "windsurf"
  | "opencode"
  | "codex"
  | "copilot-cli";

export type NoskillsUserConfig = {
  readonly name: string;
  readonly email: string;
};

export type NosManifest = {
  readonly concerns: readonly string[];
  readonly tools: readonly CodingToolId[];
  readonly providers: readonly ToolId[];
  readonly project: ProjectTraits;
  readonly maxIterationsBeforeRestart: number;
  readonly verifyCommand: string | null;
  readonly allowGit: boolean;
  readonly command: string;
  readonly user?: NoskillsUserConfig;
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
  command: "npx eser@latest noskills",
});

// =============================================================================
// Discovery Answer Helpers (backward-compatible normalization)
// =============================================================================

/**
 * Normalize a discovery answer — handles both old format (just questionId+answer)
 * and new format (with user, email, timestamp, type).
 */
export const normalizeAnswer = (
  answer: DiscoveryAnswer | AttributedDiscoveryAnswer,
): AttributedDiscoveryAnswer => {
  if ("user" in answer && "timestamp" in answer) {
    return answer as AttributedDiscoveryAnswer;
  }
  return {
    questionId: answer.questionId,
    answer: answer.answer,
    user: "Unknown User",
    email: "",
    timestamp: "",
    type: "original",
  };
};

/** Get all answers for a specific question, normalized. */
export const getAnswersForQuestion = (
  answers: readonly (DiscoveryAnswer | AttributedDiscoveryAnswer)[],
  questionId: string,
): readonly AttributedDiscoveryAnswer[] => {
  return answers
    .filter((a) => a.questionId === questionId)
    .map(normalizeAnswer);
};

/** Get the combined answer text for a question (all contributors). */
export const getCombinedAnswer = (
  answers: readonly (DiscoveryAnswer | AttributedDiscoveryAnswer)[],
  questionId: string,
): string => {
  const qAnswers = getAnswersForQuestion(answers, questionId);
  if (qAnswers.length === 0) return "";
  if (qAnswers.length === 1) return qAnswers[0]!.answer;
  return qAnswers.map((a) => `${a.answer} -- *${a.user}*`).join("\n\n");
};

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
