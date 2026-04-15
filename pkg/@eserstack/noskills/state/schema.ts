// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * State schema — types for .eser/.state/progresses/state.json and
 * .eser/manifest.yml.
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
  | "DISCOVERY_REFINEMENT"
  | "SPEC_PROPOSAL"
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
  readonly confidence?: number; // 1-10
  readonly basis?: string;
  readonly source?: "STATED" | "INFERRED" | "CONFIRMED";
  readonly questionMatch?: "exact" | "modified" | "not-asked";
};

/** Confidence-scored finding from agent analysis. */
export type ConfidenceFinding = {
  readonly finding: string;
  readonly confidence: number; // 1-10
  readonly basis: string;
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

export type FollowUp = {
  readonly id: string;
  readonly parentQuestionId: string;
  readonly question: string;
  readonly answer: string | null;
  readonly status: "pending" | "answered" | "skipped";
  readonly createdBy: string;
  readonly createdAt: string;
  readonly answeredAt?: string;
};

export type Delegation = {
  readonly questionId: string;
  readonly delegatedTo: string;
  readonly delegatedBy: string;
  readonly status: "pending" | "answered";
  readonly delegatedAt: string;
  readonly answer?: string;
  readonly answeredBy?: string;
  readonly answeredAt?: string;
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
  readonly contributors?: readonly string[];
  readonly delegations?: readonly Delegation[];
  readonly followUps?: readonly FollowUp[];
  readonly userContext?: readonly string[];
  readonly userContextProcessed?: boolean;
  readonly entryComplete?: boolean;
  /** Jidoka C1: answers were batch-submitted by agent and need user confirmation. */
  readonly batchSubmitted?: boolean;
  readonly refinement?: RefinementSubState;
};

// =============================================================================
// Refinement sub-state (DISCOVERY_REFINEMENT phase)
// =============================================================================

export type ReviewPosture =
  | "selective-expansion"
  | "hold-scope"
  | "scope-expansion"
  | "scope-reduction";

export type CompletenessScoreDimension = {
  readonly id: string;
  readonly score: number; // 1-10
  readonly notes: string;
};

export type CompletenessScore = {
  readonly overall: number; // 1-10
  readonly dimensions: readonly CompletenessScoreDimension[];
  readonly gaps: readonly string[];
  readonly assessedAt: string; // ISO timestamp
};

export type CeoReviewReadiness = {
  readonly overall: number;
  // Reuses CompletenessScoreDimension — same shape (id, score, notes)
  readonly dimensions: readonly CompletenessScoreDimension[];
  readonly verdict: "approved" | "needs-work";
};

export type RefinementSubState = {
  /** Stored after stage-a completeness assessment. Never overwritten once set (??-guard). */
  readonly initialCompletenessScore?: CompletenessScore;
  /** Updated after stage-b posture-guided re-assessment. Used for delta narrative. */
  readonly completenessScore?: CompletenessScore;
  readonly reviewPosture?: ReviewPosture;
  readonly ceoReview?: {
    readonly readinessScore: CeoReviewReadiness;
    readonly reflection?: string;
  };
};

// =============================================================================
// Spec
// =============================================================================

export type SpecSectionDefinition = {
  readonly id: string;
  readonly title: string;
  readonly placeholder: string;
  /** Classification flag that must be true for this section to appear; null = always visible. */
  readonly condition: string | null;
  /** Ordering anchor: "base:N" for base sections, "after:section-id" for concern sections. */
  readonly position: string;
};

export type ContributorEntry = {
  readonly user: string;
  readonly lastAction: string;
  readonly date: string;
};

export type ApprovalEntry = {
  readonly user: string;
  readonly status: "approved" | "pending";
  readonly date?: string;
};

export type PendingDecision = {
  readonly section: string;
  readonly question: string;
  readonly waitingFor: readonly string[];
};

export type SpecMetadata = {
  readonly created: { readonly date: string; readonly user: string };
  readonly lastModified: { readonly date: string; readonly user: string };
  readonly contributors: readonly ContributorEntry[];
  readonly approvals: readonly ApprovalEntry[];
  readonly pendingDecisions: readonly PendingDecision[];
};

export type PlaceholderStatus = {
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly status: "placeholder" | "filled" | "na" | "conditional-hidden";
  readonly filledBy?: string;
  readonly filledAt?: string;
  readonly source?: "STATED" | "INFERRED";
  /** Id of the concern that contributed this section; absent for base sections. */
  readonly concernSource?: string;
  /** Required when status === "na". Must be ≥20 chars (Jidoka I1 consistency). */
  readonly naReason?: string;
  readonly naBy?: string;
  readonly naAt?: string;
};

export type SpecState = {
  readonly path: string | null;
  readonly status: "none" | "draft" | "approved";
  readonly metadata: SpecMetadata;
  readonly placeholders: readonly PlaceholderStatus[];
};

/** Empty metadata for use when creating a SpecState without living-spec data. */
export const EMPTY_SPEC_METADATA: SpecMetadata = {
  created: { date: "", user: "" },
  lastModified: { date: "", user: "" },
  contributors: [],
  approvals: [],
  pendingDecisions: [],
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
  readonly source?: "inferred" | "confirmed" | "manual";
  readonly inferredFrom?: readonly string[];
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
  readonly confidenceFindings?: readonly ConfidenceFinding[];
  /**
   * Review-gate sub-state within EXECUTING.
   * undefined | "task" → normal task execution
   * "review-gate" → all spec tasks done; now evaluating concern review dimensions
   * against the actual implementation. File edits are blocked in this sub-state.
   * Visible to dashboards via meta.subphase = criteriaScope.
   */
  readonly criteriaScope?: "task" | "review-gate";
  /** Index into active-concerns-with-dimensions for the current review-gate cycle. */
  readonly gateConcernCursor?: number;
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
// State File (.eser/.state/progresses/state.json)
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
  specState: {
    path: null,
    status: "none",
    metadata: {
      created: { date: "", user: "" },
      lastModified: { date: "", user: "" },
      contributors: [],
      approvals: [],
      pendingDecisions: [],
    },
    placeholders: [],
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

// AI provider IDs — matches @eserstack/ai provider names
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
  readonly defaultReviewPosture?: ReviewPosture;
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

export type ReviewDimensionScope = "all" | "ui" | "api" | "data";

export type ReviewDimension = {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly evidenceRequired: boolean;
  readonly scope: ReviewDimensionScope;
};

/** Lifecycle metadata for a concern — controls when and how it fires. */
export type ConcernLifecycle = {
  /** Semantic stage grouping for dashboards and tooling. */
  readonly stage?: "ship" | "deploy" | "monitor" | "retro" | "document";
  /**
   * When true, the review gate invokes the bridge (outside voice) after this
   * concern's dimensions are checked. The bridge response is captured as
   * additional findings tagged source: "outside-voice". The gate is never
   * blocked by bridge failure — if the bridge is unavailable, the finding is
   * logged as outcome: "unavailable" and the gate continues.
   */
  readonly outsideVoice?: boolean;
  /**
   * If set, this concern's reminders and reviewDimensions are only activated
   * when the spec's kind matches one of the listed values.
   * Note: spec kind detection is not yet automated — this field is informational
   * and intended for future compiler filtering.
   */
  readonly appliesToKinds?:
    readonly ("feature" | "bugfix" | "refactor" | "docs")[];
};

export type ConcernDefinition = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extras: readonly ConcernExtra[];
  /**
   * Sections this concern contributes to the living spec.
   * Accepts both the legacy string[] format (plain section titles, for backward
   * compat — auto-migrated to SpecSectionDefinition with synthetic ids on load)
   * and the new SpecSectionDefinition[] format with full placeholder/position support.
   */
  readonly specSections: readonly (SpecSectionDefinition | string)[];
  readonly reminders: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly reviewDimensions?: readonly ReviewDimension[];
  readonly registries?: readonly string[];
  readonly dreamStatePrompt?: string;
  /**
   * Per-phase behavioral conduct rules injected into the discovery interview.
   * Appended after the global DISCOVERY_CONDUCT_RULES so they are additive, not
   * replacing. Concerns without this field are unaffected (optional).
   * Key: Phase enum value ("DISCOVERY", "DISCOVERY_REFINEMENT", etc.).
   */
  readonly conductRules?: Readonly<Partial<Record<Phase, readonly string[]>>>;
  /**
   * Display grouping category (lowercase). UI applies capitalize() for display.
   * Falls through to "general" when absent.
   */
  readonly category?: string;
  /**
   * Lifecycle metadata — controls when/how the concern fires and whether it
   * triggers the outside-voice bridge. Optional; built-in concerns may omit it.
   */
  readonly lifecycle?: ConcernLifecycle;
  /**
   * Path to an external markdown file containing long-form prompt content for
   * this concern. Resolved relative to the concern's own JSON file location.
   * When set, the markdown file content supplements or replaces the inline
   * reminders/reviewDimensions prompt strings.
   */
  readonly promptFile?: string;
  /**
   * If set, compiler injects a posture suggestion in stage-a of DISCOVERY_REFINEMENT.
   * When multiple active concerns have suggestsPosture set, a conflict warning is shown
   * instead of auto-selecting one.
   */
  readonly suggestsPosture?: ReviewPosture;
};
