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
import * as machine from "../state/machine.ts";
import type { InteractionHints } from "../sync/adapter.ts";
import * as livingSpec from "../spec/living.ts";
import { DEFAULT_CONCERNS } from "../defaults/concerns/mod.ts";
import * as questions from "./questions.ts";
import * as concerns from "./concerns.ts";
import * as learningsModule from "../dashboard/learnings.ts";
import * as splitDetector from "./split-detector.ts";
import type { ParsedSpec } from "../spec/parser.ts";
import type { FolderRule } from "./folder-rules.ts";
import { cmd as _cmd } from "../output/cmd.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

export type { InteractionHints } from "../sync/adapter.ts";

/** Shorthand: build a command string using the runtime-detected prefix. */
const c = (sub: string): string => _cmd(sub);

/**
 * Build a spec-scoped command string using positional format:
 *   `spec <specName> <subcommand> [args]`
 */
const cs = (sub: string, specName: string | null): string => {
  if (specName === null) return c(sub);
  return c(`spec ${specName} ${sub}`);
};

// =============================================================================
// Output Types (JSON contract for `noskills next`)
// =============================================================================

export type PhaseOutput =
  | DiscoveryOutput
  | DiscoveryReviewOutput
  | SpecDraftOutput
  | SpecApprovedOutput
  | ExecutionOutput
  | BlockedOutput
  | CompletedOutput
  | IdleOutput;

export type ClearContextAction = {
  readonly action: "clear_context";
  readonly reason: string;
};

export type GateInfo = {
  readonly message: string;
  readonly action: string;
  readonly phase: string;
};

export type NextOutput = PhaseOutput & {
  readonly meta: MetaBlock;
  readonly behavioral: BehavioralBlock;
  readonly roadmap: string;
  readonly gate?: GateInfo;
  readonly interactiveOptions?: readonly InteractiveOption[];
  readonly commandMap?: Record<string, string>;
  readonly toolHint?: string;
  readonly toolHintInstruction?: string;
  readonly protocolGuide?: ProtocolGuide;
  readonly clearContext?: ClearContextAction;
  /**
   * Machine-readable mode directive for the current phase.
   * Always present when phase !== "UNINITIALIZED". Agents MUST follow this.
   */
  readonly modeDirective?: string;
};

export type DiscoveryQuestion = {
  readonly id: string;
  readonly text: string;
  readonly concerns: readonly string[];
  readonly extras: readonly string[];
};

export type PreDiscoveryResearch = {
  readonly required: boolean;
  readonly instruction: string;
  readonly extractedTerms: readonly string[];
};

export type PlanContext = {
  readonly provided: boolean;
  readonly content: string;
  readonly instruction: string;
};

export type PreviousProgress = {
  readonly completedTasks: readonly string[];
  readonly totalTasks: number;
};

export type DiscoveryContributor = {
  readonly name: string;
  readonly contributions: string;
};

export type ModeSelectionOutput = {
  readonly required: boolean;
  readonly instruction: string;
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly description: string;
  }[];
};

export type PremiseChallengeOutput = {
  readonly required: boolean;
  readonly instruction: string;
  readonly prompts: readonly string[];
};

export type RichDescriptionOutput = {
  readonly provided: boolean;
  readonly length: number;
  readonly content: string;
  readonly instruction: string;
};

export type AlternativesOutput = {
  readonly required: boolean;
  readonly instruction: string;
  readonly format: {
    readonly fields: readonly string[];
  };
};

export type DiscoveryOutput = {
  readonly phase: "DISCOVERY";
  readonly instruction: string;
  readonly questions: readonly DiscoveryQuestion[];
  readonly answeredCount: number;
  readonly currentQuestion?: number;
  readonly totalQuestions?: number;
  readonly context: ContextBlock;
  readonly transition: {
    readonly onComplete: string;
  };
  readonly revisited?: boolean;
  readonly revisitReason?: string;
  readonly previousProgress?: PreviousProgress;
  readonly preDiscoveryResearch?: PreDiscoveryResearch;
  readonly planContext?: PlanContext;
  readonly currentUser?: { name: string; email: string };
  readonly previousContributors?: readonly DiscoveryContributor[];
  readonly notes?: readonly { text: string; user: string }[];
  readonly modeSelection?: ModeSelectionOutput;
  readonly premiseChallenge?: PremiseChallengeOutput;
  readonly richDescription?: RichDescriptionOutput;
  readonly agreedPremises?: readonly string[];
  readonly revisedPremises?: readonly { original: string; revision: string }[];
  readonly followUpHints?: readonly string[];
  readonly pendingFollowUps?: readonly schema.FollowUp[];
  readonly previousLearnings?: readonly string[];
  /** Populated during the listen-first step when a recent plan file is found on disk. */
  readonly activePlanDetected?: {
    readonly path: string;
    readonly age: string;
    readonly preview: string;
    readonly quality: "ok" | "sparse";
  };
  /** True when state.discovery.planPath is set (plan already imported/in state). */
  readonly planImported?: boolean;
};

export type DiscoveryReviewAnswer = {
  readonly questionId: string;
  readonly question: string;
  readonly answer: string;
};

export type ReviewChecklistDimension = {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly evidenceRequired: boolean;
  readonly isRegistry: boolean;
  readonly concernId: string;
};

export type ReviewChecklist = {
  readonly dimensions: readonly ReviewChecklistDimension[];
  readonly instruction: string;
  readonly registryInstruction?: string;
};

export type DiscoveryReviewOutput = {
  readonly phase: "DISCOVERY_REFINEMENT";
  readonly instruction: string;
  readonly answers: readonly DiscoveryReviewAnswer[];
  readonly transition: {
    readonly onApprove: string;
    readonly onRevise: string;
  };
  readonly splitProposal?: splitDetector.SplitProposal;
  readonly subPhase?: string;
  readonly alternatives?: AlternativesOutput;
  readonly reviewChecklist?: ReviewChecklist;
  readonly classificationPreview?: string;
  /** Completeness score from stage-a/stage-b assessment (exp-5). */
  readonly completenessScore?: schema.CompletenessScore;
  /** Review posture chosen by user in stage-a (exp-5). */
  readonly reviewPosture?: schema.ReviewPosture;
};

export type ClassificationPrompt = {
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  readonly instruction: string;
};

export type SelfReview = {
  readonly required: boolean;
  readonly checks: readonly string[];
  readonly instruction: string;
};

export type SpecDraftOutput = {
  readonly phase: "SPEC_PROPOSAL";
  readonly instruction: string;
  readonly specPath: string;
  readonly transition: {
    readonly onApprove: string;
  };
  readonly classificationRequired?: boolean;
  readonly classificationPrompt?: ClassificationPrompt;
  readonly selfReview?: SelfReview;
  readonly saved?: boolean;
};

export type SpecApprovedOutput = {
  readonly phase: "SPEC_APPROVED";
  readonly instruction: string;
  readonly specPath: string;
  readonly transition: {
    readonly onStart: string;
  };
  readonly saved?: boolean;
};

export type AcceptanceCriterion = {
  readonly id: string;
  readonly text: string;
};

export type StatusReportRequest = {
  readonly criteria: readonly AcceptanceCriterion[];
  readonly reportFormat: {
    readonly completed: string;
    readonly remaining: string;
    readonly blocked: string;
    readonly na?: string;
    readonly newIssues?: string;
  };
};

export type DebtCarryForward = {
  readonly fromIteration: number;
  readonly items: readonly schema.DebtItem[];
  readonly note: string;
};

export type PromotePrompt = {
  readonly decisionId: string;
  readonly question: string;
  readonly choice: string;
  readonly prompt: string;
};

export type TaskBlock = {
  readonly id: string;
  readonly title: string;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly files?: readonly string[];
};

export type DesignChecklistDimension = {
  readonly id: string;
  readonly label: string;
};

export type DesignChecklist = {
  readonly required: boolean;
  readonly instruction: string;
  readonly dimensions: readonly DesignChecklistDimension[];
};

export type PreExecutionReview = {
  readonly instruction: string;
};

export type ExecutionOutput = {
  readonly phase: "EXECUTING";
  readonly instruction: string;
  readonly task?: TaskBlock;
  readonly batchTasks?: readonly string[];
  readonly context: ContextBlock;
  readonly transition: {
    readonly onComplete: string;
    readonly onBlocked?: string;
    readonly iteration: number;
  };
  readonly concernTensions?: readonly concerns.ConcernTension[];
  readonly restartRecommended?: boolean;
  readonly restartInstruction?: string;
  readonly verificationFailed?: boolean;
  readonly verificationOutput?: string;
  readonly statusReportRequired?: boolean;
  readonly statusReport?: StatusReportRequest;
  readonly previousIterationDebt?: DebtCarryForward;
  readonly promotePrompt?: PromotePrompt;
  readonly taskRejected?: boolean;
  readonly rejectionReason?: string;
  readonly rejectionRemaining?: readonly string[];
  readonly designChecklist?: DesignChecklist;
  readonly preExecutionReview?: PreExecutionReview;
};

export type BlockedOutput = {
  readonly phase: "BLOCKED";
  readonly instruction: string;
  readonly reason: string;
  readonly transition: {
    readonly onResolved: string;
  };
};

export type CompletedOutput = {
  readonly phase: "COMPLETED";
  readonly summary: {
    readonly spec: string | null;
    readonly iterations: number;
    readonly decisionsCount: number;
    readonly completionReason: schema.CompletionReason | null;
    readonly completionNote: string | null;
  };
  readonly learningPrompt?: {
    readonly instruction: string;
    readonly examples: readonly string[];
  };
  /** Jidoka M1: visible flag that learnings haven't been submitted yet. */
  readonly learningsPending?: boolean;
  readonly staleDiagrams?: readonly {
    readonly file: string;
    readonly line: number;
    readonly reason: string;
  }[];
  /** Jidoka M4: stale diagrams are mandatory ACs that must be resolved. */
  readonly staleDiagramsBlocking?: boolean;
};

export type InteractiveOption = {
  readonly label: string;
  readonly description: string;
};

type InternalOption = {
  readonly label: string;
  readonly description: string;
  readonly command: string;
};

export type ConcernInfo = {
  readonly id: string;
  readonly description: string;
};

export type SpecSummary = {
  readonly name: string;
  readonly phase: string;
  readonly iteration: number;
  readonly detail?: string;
};

export type IdleOutput = {
  readonly phase: "IDLE";
  readonly instruction: string;
  readonly welcome: string;
  readonly existingSpecs: readonly SpecSummary[];
  readonly availableConcerns: readonly ConcernInfo[];
  readonly activeConcerns: readonly string[];
  readonly activeRulesCount: number;
  readonly behavioralNote?: string;
  readonly hint?: string;
};

export type ContextBlock = {
  readonly rules: readonly string[];
  readonly concernReminders: readonly string[];
};

// =============================================================================
// Meta Block — self-documenting resume context for every output
// =============================================================================

export type EnforcementInfo = {
  readonly level: "enforced" | "behavioral";
  readonly capabilities: readonly string[];
  readonly gaps?: readonly string[];
};

export type MetaBlock = {
  readonly protocol: string;
  readonly spec: string | null;
  readonly branch: string | null;
  readonly iteration: number;
  readonly lastProgress: string | null;
  readonly activeConcerns: readonly string[];
  readonly resumeHint: string;
  readonly enforcement?: EnforcementInfo;
};

export type ProtocolGuide = {
  readonly what: string;
  readonly how: string;
  readonly currentPhase: string;
};

// =============================================================================
// Behavioral Block — phase-aware guardrails for agent behavior
// =============================================================================

export type BehavioralBlock = {
  readonly modeOverride?: string;
  readonly rules: readonly string[];
  readonly tone: string;
  readonly urgency?: string;
  readonly outOfScope?: readonly string[];
  readonly tier2Summary?: string;
};

// =============================================================================
// Spec Classification Inference
// =============================================================================

/** Category → regex + label for keyword evidence. */
const CLASSIFICATION_PATTERNS: ReadonlyArray<{
  readonly key: keyof Omit<
    schema.SpecClassification,
    "source" | "inferredFrom"
  >;
  readonly pattern: RegExp;
}> = [
  {
    key: "involvesWebUI",
    pattern:
      /\b(ui|frontend|component|react|css|html|button|modal|form|page|screen|layout|design|loading state|empty state|error state)\b/i,
  },
  {
    key: "involvesCLI",
    pattern: /\b(cli|terminal|command.?line|stdout|stdin|ansi|tui|console)\b/i,
  },
  {
    key: "involvesPublicAPI",
    pattern:
      /\b(api|endpoint|rest|graphql|webhook|public.?facing|sdk|client.?library)\b/i,
  },
  {
    key: "involvesMigration",
    pattern:
      /\b(migrat\w*|schema.?change|breaking.?change|backward.?compat|upgrade|deprecat\w*)\b/i,
  },
  {
    key: "involvesDataHandling",
    pattern:
      /\b(pii|gdpr|encrypt|personal.?data|user.?data|data.?retention|data.?safety|sensitive)\b/i,
  },
];

/**
 * Infer a SpecClassification from the spec description + discovery userContext
 * + answers. Returns source="inferred" and populates inferredFrom with the
 * matched keywords (not the full regex) so a human reviewer sees evidence.
 *
 * This is a REGEX-ONLY heuristic — intentionally boring. If keywords drift,
 * the REFINEMENT confirmation catches misses.
 */
export const inferClassification = (
  state: schema.StateFile,
): schema.SpecClassification => {
  const parts: string[] = [];
  if (state.specDescription) parts.push(state.specDescription);
  const userContext = state.discovery?.userContext;
  if (Array.isArray(userContext)) parts.push(...userContext);
  for (const a of state.discovery?.answers ?? []) {
    parts.push(a.answer);
  }
  const allText = parts.join(" ");

  const result: {
    involvesWebUI: boolean;
    involvesCLI: boolean;
    involvesPublicAPI: boolean;
    involvesMigration: boolean;
    involvesDataHandling: boolean;
    source: "inferred";
    inferredFrom: string[];
  } = {
    involvesWebUI: false,
    involvesCLI: false,
    involvesPublicAPI: false,
    involvesMigration: false,
    involvesDataHandling: false,
    source: "inferred",
    inferredFrom: [],
  };

  for (const { key, pattern } of CLASSIFICATION_PATTERNS) {
    const match = allText.match(pattern);
    if (match !== null) {
      result[key] = true;
      result.inferredFrom.push(`${key}:${match[0].toLowerCase()}`);
    }
  }

  return result;
};

/** Category → human label for preview rendering. */
const CLASSIFICATION_LABELS: ReadonlyArray<{
  readonly key: keyof Omit<
    schema.SpecClassification,
    "source" | "inferredFrom"
  >;
  readonly label: string;
}> = [
  { key: "involvesWebUI", label: "Web UI" },
  { key: "involvesPublicAPI", label: "Public API" },
  { key: "involvesCLI", label: "CLI" },
  { key: "involvesMigration", label: "Migration" },
  { key: "involvesDataHandling", label: "Data Handling" },
];

/**
 * Render an inferred classification as calm prose for REFINEMENT confirmation.
 * Uses ASCII ✓/✗ markers and quotes keyword evidence from inferredFrom.
 * Pure function — no side effects, no decoration beyond plain indented list.
 */
export const formatClassificationPreview = (
  classification: schema.SpecClassification,
): string => {
  // Group keyword evidence by category key (e.g. "involvesWebUI:button" → ["button"]).
  const evidenceByKey = new Map<string, string[]>();
  for (const entry of classification.inferredFrom ?? []) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx === -1) continue;
    const key = entry.slice(0, colonIdx);
    const keyword = entry.slice(colonIdx + 1);
    const existing = evidenceByKey.get(key);
    if (existing === undefined) {
      evidenceByKey.set(key, [keyword]);
    } else if (!existing.includes(keyword)) {
      existing.push(keyword);
    }
  }

  const lines: string[] = ["Based on your answers, this spec involves:"];
  for (const { key, label } of CLASSIFICATION_LABELS) {
    const matched = classification[key] === true;
    const marker = matched ? "\u2713" : "\u2717";
    if (matched) {
      const keywords = evidenceByKey.get(key) ?? [];
      if (keywords.length > 0) {
        const quoted = keywords.map((k) => `"${k}"`).join(", ");
        lines.push(`  ${marker} ${label}  (mentions: ${quoted})`);
      } else {
        lines.push(`  ${marker} ${label}`);
      }
    } else {
      lines.push(`  ${marker} ${label}`);
    }
  }
  return lines.join("\n");
};

// Invariant: applies to every phase, every output. Non-negotiable.
const GIT_READONLY_RULE =
  "NEVER run git write commands (commit, add, push, checkout, stash, reset, merge, rebase, cherry-pick). Git is read-only for agents. The user controls git. You may read: git log, git diff, git status, git show, git blame.";

/**
 * Discovery Conduct Rules — injected into DISCOVERY and DISCOVERY_REFINEMENT phases.
 * These convert the discovery interview from advisory guidance into a structured
 * Socratic policy. Not written to adapter rule files (static boot context) —
 * these go through the runtime `next` JSON channel only.
 *
 * Global rules fire for every spec. Concern-contributed rules (from
 * ConcernDefinition.conductRules) are appended after these per active concern.
 */
const DISCOVERY_CONDUCT_RULES: readonly string[] = [
  "Interview the user relentlessly about every aspect of this plan until you reach a shared understanding.",
  "Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.",
  "For each question, provide your recommended answer — don't just ask, offer your informed opinion.",
  "Ask questions ONE AT A TIME. Do not batch questions. Each question deserves its own focused exchange.",
  "If a question can be answered by exploring the codebase, explore the codebase INSTEAD of asking. Only ask the user what the codebase cannot tell you.",
  "You are an honest engineer. Do NOT fill placeholders with assumptions.",
  "You are investing in this spec like a CEO invests in a product — get the details right.",
  "You are doing academic-level due diligence — no hand-waving, no 'we'll figure it out later.'",
  "If a section is not applicable, ask the user to confirm it's N/A with a specific reason — don't decide yourself.",
  "If two answers conflict, surface the conflict to the user — don't resolve it yourself.",
  "If an answer is vague, push back and ask for specifics — don't accept vague.",
];

/** Default interaction hints — Claude Code behavior. */
const DEFAULT_HINTS: InteractionHints = {
  hasAskUserTool: true,
  optionPresentation: "tool",
  hasSubAgentDelegation: true,
  subAgentMethod: "task",
};

// =============================================================================
// DISCOVERY_REFINEMENT helpers: CEO review rules + posture suggestion (exp-3)
// =============================================================================

/**
 * Returns 3 CEO review sections for hold-scope, 10 for all other postures.
 * Scope-expansion replaces the final "SCOPE DISCIPLINE" section with "EXPANSION TABLE".
 */
const CEO_REVIEW_RULES = (posture: schema.ReviewPosture): string[] => {
  const base = [
    "CEO REVIEW — PREMISE CHECK: Restate the core premise in one sentence. Does it still hold? What evidence supports it? What challenges it?",
    "CEO REVIEW — READINESS DASHBOARD: Score 8 dimensions 1-10 (premise-clarity, reuse-leverage, test-coverage, failure-mode-coverage, boundary-clarity, unresolved-decisions, verification-path, scope-discipline). State overall score. Verdict: APPROVED or NEEDS WORK.",
    "CEO REVIEW — REFLECTION: Honest observation of the user's decision patterns during this spec. Not flattery. If they made a questionable choice, say so respectfully.",
  ];
  if (posture === "hold-scope") return base; // abbreviated — 3 sections only
  const full = [
    ...base,
    "CEO REVIEW — REUSE SCORE: Table of existing modules/functions reused vs new code. Calculate approximate reuse percentage. Flag if <40%.",
    "CEO REVIEW — DREAM STATE DELTA: Current state (2-3 sentences), 12-month ideal (2-3 sentences), what this spec delivers (%), remaining gap.",
    "CEO REVIEW — FAILURE MODE REGISTRY: Table with #, Failure, Trigger, Mitigation. Every failure mode must have concrete mitigation. Include at minimum: data corruption, race conditions, backward compat, user confusion, performance.",
    "CEO REVIEW — NOT IN SCOPE: Explicit list of what this spec does NOT touch, with reasons. This is a contract.",
    "CEO REVIEW — UNRESOLVED DECISIONS: Table with #, Decision, Default, Notes. Every unresolved decision must have a safe default. Present to user.",
    "CEO REVIEW — FILE-LEVEL PLAN: Table of every file created/modified with purpose. Plus: functions to reuse, files NOT modified.",
    posture === "scope-expansion"
      ? "CEO REVIEW — EXPANSION TABLE: Present all accepted expansions with LOC estimates."
      : "CEO REVIEW — SCOPE DISCIPLINE: List what was held out of scope and why.",
  ];
  return full;
};

/**
 * Returns a posture suggestion string if exactly one active concern has suggestsPosture set.
 * Returns a conflict warning when multiple concerns suggest different postures.
 * Returns null when no concern suggests a posture.
 */
const concernPostureSuggestion = (
  activeConcerns: readonly schema.ConcernDefinition[],
): string | null => {
  const suggestors = activeConcerns.filter((c) =>
    c.suggestsPosture !== undefined
  );
  if (suggestors.length === 0) return null;
  if (suggestors.length === 1) {
    return `Based on your active concerns, suggested posture: ${
      suggestors[0]!.suggestsPosture
    } (${suggestors[0]!.name} active).`;
  }
  const list = suggestors.map((c) => `${c.name}: ${c.suggestsPosture}`).join(
    ", ",
  );
  return `Multiple concerns suggest different postures (${list}). Please select manually: a/b/c/d.`;
};

const buildBehavioral = (
  state: schema.StateFile,
  maxIterationsBeforeRestart: number,
  allowGit: boolean,
  activeConcerns: readonly schema.ConcernDefinition[],
  parsedSpec?: ParsedSpec | null,
  hints: InteractionHints = DEFAULT_HINTS,
  manifest?: schema.NosManifest | null,
): BehavioralBlock => {
  const stale = state.execution.iteration >= maxIterationsBeforeRestart;

  const askMethod = hints.hasAskUserTool
    ? "Use AskUserQuestion for all decision points."
    : "Present options as a numbered list at every decision point.";

  const mandatoryRules: string[] = [];
  if (!allowGit) mandatoryRules.push(GIT_READONLY_RULE);
  mandatoryRules.push(
    "Report progress honestly. Not done = 'not done'. Partial = 'partial: [works]/[doesn't]'. Untested = 'untested'. 4 of 6 = '4 of 6 done, 2 remaining'.",
    `Never skip steps or infer decisions. ${askMethod} Recommend first, then ask. One noskills call per interaction — never batch-submit or backfill.`,
    "Display `roadmap` before other content. Display `gate` prominently.",
    "NEVER suggest bypassing, skipping, or 'breaking out of' noskills. Discovery helps the user — it is not an obstacle. If scope changes: revise spec, reset and create new, or split.",
    "NEVER ask permission to run the next noskills command. After spec new → run next immediately. After answering questions → run next. After approve → run next. After task completion → run next. The workflow is sequential — each step has one next step. Just run it.",
    "Listen first: after spec creation, ask 'Tell me about this — share as much context as you have.' Wait for their response before mode selection. Rich context (>200 chars) → pre-fill discovery answers as STATED/INFERRED. Brief response → proceed normally.",
    'Discovery questions are adaptive. After each answer, generate 1-3 follow-up questions if the answer reveals ambiguity, risk, dependencies, or missing detail. Submit follow-ups via `noskills spec <name> followup <questionId> "question"`. Max 3 per question. Do NOT rush through discovery.',
    "Confidence scoring: every technical finding needs a confidence score (1-10). 9-10: verified (read code, ran test). 7-8: strong evidence. 5-6: reasonable inference. 3-4: guess. 1-2: speculation. State basis ('read X', 'inferred from Y'). If confidence < 5, prefix with '\u26A0 Unverified:'.",
  );
  const scopeItems = parsedSpec?.outOfScope ?? [];

  const specName = state.spec;

  switch (state.phase) {
    case "IDLE": {
      const optionRule = hints.optionPresentation === "tool"
        ? "Pass interactiveOptions DIRECTLY to AskUserQuestion options array (header max 12 chars). Use commandMap to resolve selections. For availableConcerns: AskUserQuestion with multiSelect:true, max 4 per question — split across questions if needed. Present ALL concerns."
        : "Present interactiveOptions as numbered list. Use commandMap to resolve selections. Present ALL availableConcerns as numbered list for multiselect.";

      return {
        rules: [
          "If the user described a feature/bug/task, create a spec immediately: `noskills spec new \"description\"` — name is auto-generated. Do NOT present menus or ask 'What would you like to do?' unless the conversation has no prior context.",
          ...mandatoryRules,
          optionRule,
          "Encourage full context: 'Tell me what you want to build — one-liner, detailed requirements, meeting notes, anything.' Slug is auto-generated. Pass full text to `noskills spec new \"...\"`.",
          "After spec new, ask: full discovery, quick discovery, or skip to spec draft. Never skip without asking.",
          "Every task gets a spec. No exceptions. A one-liner fix, a config change, a 'simple' refactor — all get specs. The spec can be short but it must exist. 'Too simple for a spec' is the anti-pattern.",
          "SPEC CREATION: When user says 'create a new spec', 'new spec', or similar — do NOT run `noskills spec new` without a description. Ask the user 'What do you want to build?' via AskUserQuestion first. Wait for their response. Then run: `noskills spec new \"their full response\"`. This takes < 5 seconds. Do not overthink it.",
          "CONCERN MANAGEMENT: When the user wants to add or view concerns, run `noskills concern list` immediately. Do NOT analyze or recommend concerns. Present the list via AskUserQuestion (multiSelect:true, max 4 per question). Use a SINGLE `noskills concern add id1 id2 id3` command for all selections.",
        ],
        tone: "Welcoming. Present choices, then wait.",
      };
    }

    case "DISCOVERY": {
      const questionMethod = hints.hasAskUserTool
        ? "Ask each question via AskUserQuestion. One question per call."
        : "Ask one question at a time as text.";

      // Concern-contributed conduct rules for this phase (Expansion E)
      const concernConductRules = activeConcerns.flatMap(
        (c) => c.conductRules?.["DISCOVERY"] ?? [],
      );

      return {
        modeOverride:
          "plan mode. DO NOT create, edit, or write any files. DO NOT run state-modifying commands. MAY read files and run read-only commands (cat, ls, grep, git log, git diff).",
        rules: [
          ...mandatoryRules,
          "MODE: You MUST be in plan mode during discovery. Do not exit plan mode. If you are not in plan mode, enter it now (Shift+Tab or /plan).",
          `${questionMethod} Never answer questions yourself. Never submit answers without user confirmation. Pre-fill suggested answers from detailed descriptions — user must confirm each. With a fully formed plan, skip questions but MUST run premise challenge and alternatives.`,
          "DO NOT create, edit, or write any files.",
          "DO NOT run shell commands that modify state.",
          "You MAY read files and run read-only commands (cat, ls, grep, git log, git diff).",

          // Pre-scan + research + mode selection
          "Pre-discovery: (1) pre-discovery codebase scan — read README, CLAUDE.md, design docs, last 20 commits, TODOs, existing specs, directory structure. Present a brief audit summary. (2) If `preDiscoveryResearch.required`, web-search every `extractedTerms` entry — report versions, API changes, deprecations. (3) Ask discovery mode: A) Explore scope B) Technical depth C) Validate my plan D) Ship fast. Adapt emphasis accordingly.",

          // Premise challenge
          "Before starting discovery questions, challenge the user's initial spec description against codebase findings. Flag: hidden complexity, conflicts with existing code, scope mismatch, overlapping modules. Ask clarifying follow-ups.",

          // Question style
          "When asking questions, offer concrete options from codebase knowledge alongside the open-ended question (e.g., 'I see three scenarios: A)... B)... C)... D) Something else'). Push back on vague answers. Follow up on short answer with 'Can you be more specific?'",

          // Dream state + expansions + architecture + error map
          (() => {
            const dreamPrompts = concerns.getDreamStatePrompts(activeConcerns);
            const dreamBase = dreamPrompts.length > 0
              ? `After answers, ${dreamPrompts.join(" Also: ")}`
              : "After answers, synthesize CURRENT STATE → THIS SPEC → 6-MONTH IDEAL vision.";
            return `${dreamBase} Then: (1) expansion opportunities as numbered proposals with effort (S/M/L/XL), risk, completeness delta — options: Add/Defer/Skip. (2) Architectural decisions that BLOCK implementation — present with options, RECOMMENDATION, completeness scores. Unresolved = risk flag. (3) Error/rescue map: codepath | failure mode | handling. Flag CRITICAL GAPS as decisions.`;
          })(),

          // Synthesis + submit
          "Present DISCOVERY SUMMARY for confirmation: intent, scope, dream state, expansions, architectural decisions, error map. Ask for confirmation before generating spec. Submit all answers together in one `noskills next --answer` JSON call.",

          // Discovery conduct rules (global + concern-contributed)
          ...DISCOVERY_CONDUCT_RULES,
          ...concernConductRules,
        ],
        tone:
          "Curious interviewer with a stake in the answers. Comes PREPARED — read the codebase first. Challenge assumptions, think about architecture and failure modes.",
      };
    }

    case "DISCOVERY_REFINEMENT": {
      // Concern-contributed conduct rules for this phase (Expansion E)
      const concernConductRulesRefinement = activeConcerns.flatMap(
        (c) => c.conductRules?.["DISCOVERY_REFINEMENT"] ?? [],
      );

      const stage = machine.getDiscoveryRefinementStage(state);

      let stageRules: string[];
      if (stage === "stage-a") {
        const suggestion = concernPostureSuggestion(activeConcerns);
        const hasDefault = manifest?.defaultReviewPosture !== undefined;
        stageRules = [
          "COMPLETENESS ASSESSMENT: Before presenting answers for review, evaluate the spec's completeness across 6 dimensions. Score each 1-10: problem-clarity, scope-definition, technical-feasibility, verification-strategy, risk-identification, user-impact-analysis. Identify concrete gaps (specific, not vague). Present the table and gaps to the user.",
          "Scoring guide: 9-10 = fully addressed; 7-8 = mostly addressed; 5-6 = partially; 3-4 = weakly; 1-2 = not addressed. A gap is anything the spec doesn't explicitly address that could cause problems during execution.",
        ];
        if (suggestion !== null) stageRules.push(suggestion);
        if (hasDefault) {
          stageRules.push(
            `Using project default posture: ${
              manifest!.defaultReviewPosture
            } (from manifest.yml). To override, answer with a/b/c/d. Answer 'clear-posture' to remove this default.`,
          );
        } else {
          stageRules.push(
            "After presenting the completeness assessment, present the 4 review posture options: (a) Selective expansion — fill gaps only, no scope drift; (b) Hold scope — surface risks but no additions; (c) Scope expansion — actively explore adjacent features; (d) Scope reduction — cut to essentials. Ask user to choose.",
          );
        }
        stageRules.push(
          hints.hasAskUserTool
            ? "Use AskUserQuestion to present the completeness table and posture options together in one question."
            : "Present completeness table and posture options in one message. User replies with 'a', 'b', 'c', or 'd'.",
        );
      } else if (stage === "stage-b") {
        const posture = state.discovery.refinement?.reviewPosture;
        const postureRule = posture === "selective-expansion"
          ? "REVIEW POSTURE: Selective expansion. Hold core scope rigid. Only suggest additions that address gaps from the completeness assessment. Each suggestion must explain: what gap it fills, what goes wrong if skipped. Target: raise completeness to 9+/10 with minimal additions."
          : posture === "hold-scope"
          ? "REVIEW POSTURE: Hold scope. Do NOT propose any additions or changes. Surface risks as observations, not change requests. Your job is to confirm the spec is ready, not to improve it."
          : posture === "scope-expansion"
          ? "REVIEW POSTURE: Scope expansion. Actively look for adjacent concerns and missing features. Each expansion must ride on infrastructure already being built. Present ALL suggestions as a multi-select table with columns: Addition | Why it rides cheap | LOC estimate."
          : "REVIEW POSTURE: Scope reduction. Identify everything that can be deferred. For each item: what's deferred, risk of deferring, minimal viable version. Present cut list for user approval.";

        stageRules = [postureRule];

        if (state.discovery.refinement?.completenessScore) {
          stageRules.push(
            "RE-ASSESSMENT: After posture-guided review is complete, re-score the 6 completeness dimensions. Show delta: what was addressed (✓), what remains (△). Submit updated score as JSON {completeness: {...}} before CEO review.",
          );
        }

        stageRules.push(
          "When posture-guided review is complete, produce the CEO REVIEW ANALYSIS (see CEO review protocol rules below). Submit it as JSON {ceoReview: {...}, reflection?: '...'} to record it.",
        );
        stageRules.push(...CEO_REVIEW_RULES(posture ?? "selective-expansion"));
      } else {
        // stage-c: CEO review done — present delta and get final decision
        stageRules = [
          "CEO review is complete. Present the updated completeness score delta, the readiness dashboard verdict, and ask the user to advance (approve), revise, or park the spec.",
          hints.hasAskUserTool
            ? "Use AskUserQuestion to present: updated completeness (delta table), readiness verdict, and options: advance / revise / park."
            : "Present delta and verdict. User answers: approve (advance), revise (return to stage-a), or park (cancel).",
        ];
      }

      return {
        modeOverride:
          "You are in plan mode. Do not create, edit, or write any files.",
        rules: [
          ...mandatoryRules,
          "DO NOT create, edit, or write any files.",
          ...stageRules,
          // Discovery conduct rules (global + concern-contributed)
          ...DISCOVERY_CONDUCT_RULES,
          ...concernConductRulesRefinement,
        ],
        tone: stage === "stage-a"
          ? "Structured evaluator. Score honestly — do not inflate."
          : stage === "stage-b"
          ? "Posture-guided reviewer. Follow the posture rules exactly."
          : "Decisive closer. Present delta and get a final decision.",
      };
    }

    case "SPEC_PROPOSAL": {
      // Build delegation status rule if delegations exist
      const delegations = state.discovery.delegations ?? [];
      const delegationRules: string[] = [];
      if (delegations.length > 0) {
        const pending = delegations.filter((d) => d.status === "pending");
        const answered = delegations.filter((d) => d.status === "answered");
        const lines = delegations.map((d) =>
          `- ${d.questionId}: delegated to ${d.delegatedTo} — ${
            d.status === "answered" ? "ANSWERED ✓" : "PENDING"
          }`
        );
        delegationRules.push(
          `DELEGATION STATUS:\n${lines.join("\n")}${
            pending.length > 0
              ? `\nApprove BLOCKED — ${pending.length} pending delegation(s).`
              : `\nAll ${answered.length} delegation(s) answered. Approve is allowed.`
          }`,
        );
      }

      return {
        modeOverride:
          "plan mode. DO NOT create, edit, or write any files. DO NOT run state-modifying commands. MAY read files and run read-only commands.",
        rules: [
          ...mandatoryRules,
          ...delegationRules,
          "DO NOT create, edit, or write any files.",
          "Read the spec and present a summary to the user.",
          "Flag any tasks that are too vague to execute.",
          "Flag any missing acceptance criteria.",
          "No placeholders in specs. If a task has 'TBD', 'TODO', 'to be determined', 'details to follow', or 'implement appropriate X' — fill in the detail or remove the task and add it as an open question.",
          "Ask the user if they want to refine before approving.",
          hints.hasAskUserTool
            ? "When presenting classification options, use AskUserQuestion with multiSelect:true. Do NOT infer classification yourself."
            : "When presenting classification options, present them as a numbered list with multiselect (user picks multiple numbers). Do NOT infer classification yourself.",
          "When generating or refining tasks, include a 'Files:' hint listing likely files to create/modify. Format: 'Files: `path/to/file.ts`, `path/to/other.ts`'. Hints, not constraints — helps sub-agents load right context.",
          "If you identify issues in the spec (vague tasks, irrelevant sections, missing acceptance criteria), submit a refinement via: `" +
          cs(
            'next --answer=\'{"refinement":"task-1: Add upload endpoint, task-2: Add validation middleware, task-3: Write integration tests"}\'',
            specName,
          ) +
          "`. The spec will be updated and you can review again.",
        ],
        tone: "Thoughtful reviewer preparing to hand off to an implementer.",
      };
    }

    case "SPEC_APPROVED":
      return {
        rules: [
          ...mandatoryRules,
          "The spec is approved but execution has not started.",
          "Do not start coding until the user triggers execution.",
          "If the user wants changes, they must reset and re-spec.",
          hints.hasAskUserTool
            ? "Before starting execution, show the spec summary to the user and ask for final confirmation via AskUserQuestion."
            : "Before starting execution, show the spec summary to the user and ask for final confirmation. Present 'Start execution' and 'Not yet' as numbered options.",
        ],
        tone: "Patient. Wait for the go signal.",
      };

    case "EXECUTING": {
      // Sub-agent delegation — build method-specific spawn instruction
      const reportCmd = cs(
        'next --answer=\'{"completed":[...],"remaining":[...],"blocked":[...]}\'',
        specName,
      );
      let spawnInstruction: string;
      let verifyInstruction: string;

      const verifierScope =
        "Verifier scope: (1) AC verification with evidence. (2) Plan alignment — does implementation match task description? Flag deviations. (3) Code quality — follows existing patterns? Flag style breaks, missing error handling. Categorize findings: CRITICAL (blocks completion), IMPORTANT (should fix), SUGGESTION (nice to have).";

      if (hints.subAgentMethod === "task") {
        spawnInstruction =
          `Spawn noskills-executor via Agent tool. Pass: task title, description, ACs, rules, scope constraints, concern reminders, file paths. Report via \`${reportCmd}\`.`;
        verifyInstruction =
          `After executor completes, spawn noskills-verifier with changed files + ACs + test commands. Never trust executor self-report alone. ${verifierScope}`;
      } else if (hints.subAgentMethod === "spawn") {
        spawnInstruction =
          `Use spawn_agent for noskills-executor. Pass: task, ACs, rules, scope, file paths. Use wait_agent to collect. Report via \`${reportCmd}\`.`;
        verifyInstruction =
          `After executor completes, spawn noskills-verifier with changed files + ACs + test commands. ${verifierScope}`;
      } else if (hints.subAgentMethod === "fleet") {
        spawnInstruction =
          `Use /fleet for parallel executors. Pass each: task, ACs, rules, scope, file paths. Report via \`${reportCmd}\`.`;
        verifyInstruction =
          `After fleet completes, run verification pass. ${verifierScope}`;
      } else if (hints.subAgentMethod === "delegation") {
        spawnInstruction =
          `Use Kiro agent delegation for noskills-executor. Pass: task, ACs, rules, scope, file paths. Report via \`${reportCmd}\`.`;
        verifyInstruction =
          `After executor completes, delegate to noskills-verifier with changed files + ACs + test commands. ${verifierScope}`;
      } else {
        spawnInstruction =
          `Execute tasks sequentially yourself. Verify (type-check + tests) after each. Report via \`${reportCmd}\`.`;
        verifyInstruction = "";
      }

      const hasSubAgents = hints.subAgentMethod !== "none";
      const orchestratorRule = hasSubAgents
        ? `You are the orchestrator. NEVER edit files directly — delegate ALL edits to noskills-executor. ${spawnInstruction} On sub-agent failure, fall back to direct execution and note it in status.`
        : spawnInstruction;

      const base: string[] = [
        ...mandatoryRules,
        "MODE: You MUST NOT be in plan mode during execution. If you are in plan mode, exit it now. Sub-agents need full write access.",
        orchestratorRule,
        ...(verifyInstruction ? [verifyInstruction] : []),
        // Scope discipline
        "Do not explore beyond current task. Do not refactor outside scope. Do not add features, tests, or docs not in the spec. timebox context reads — the deliverable is working code.",
        // Sub-agent splitting (only for tools with sub-agents)
        ...(hasSubAgents
          ? [
            "Show a dispatch table: | Step | Agent | Files | Tasks | Est. |. Separate executor for implementation vs tests. Batch tightly-coupled files; parallelize independent modules.",
          ]
          : []),
        // Edit discipline (merged from 5 rules)
        "Edit discipline: (1) Re-read file before editing. (2) Re-read after to confirm. (3) Files >500 LOC: read in chunks. (4) Run type-check + lint after edits — never mark AC passed if type-check fails. (5) If search returns few results, re-run narrower — assume truncation.",
        // Convention discovery
        `On recurring patterns or corrections, ask: 'Permanent rule or just this task?' If permanent: \`${
          c('rule add "<description>"')
        }\`. Never write to \`.eser/rules/\` directly.`,
        // Dead code + commitment
        "Before structural refactors on files >300 LOC, remove dead code first. Do NOT suggest pausing or stopping mid-spec — execute to completion. The user decides when to stop.",
        // Rationalization prevention
        "RATIONALIZATION ALERT: Never use 'should work now', 'looks correct', 'I'm confident', 'seems right', 'probably passes'. Run the command, read the output, report what happened. Evidence, not belief.",
        // TDD red-green cycle
        "TDD: (1) Write test. (2) Run it — MUST fail. If it passes before implementation, the test is wrong. (3) Implement. (4) Run test — must pass. Skipping step 2 means the test is unverified.",
        // Parallel vs serial
        "Parallel vs serial sub-agents: PARALLEL when tasks touch different files with no shared state. SERIAL when tasks modify same files or depend on each other. When unsure, default to serial.",
        // Jidoka I3: verifier enforcement
        ...(hasSubAgents
          ? [
            "VERIFICATION REQUIRED: After EVERY task completion, you MUST spawn noskills-verifier before reporting done. If you skip verification and self-report, the status report will flag it. No exceptions — 'it looks correct' is not verification.",
          ]
          : [
            "VERIFICATION REQUIRED: After EVERY task completion, run type-check + tests before reporting done. Evidence of passing tests must be included in the status report.",
          ]),
      ];

      if (state.execution.lastVerification?.passed === false) {
        base.push(
          "Tests are failing. Fix ONLY the failing tests. Do not refactor passing code.",
        );
      }

      const behavioral: BehavioralBlock = {
        rules: base,
        tone: "Direct. Orchestrate immediately — spawn sub-agents.",
        outOfScope: scopeItems.length > 0 ? scopeItems : undefined,
      };

      if (stale) {
        return {
          ...behavioral,
          urgency:
            `${state.execution.iteration}+ iterations — context degrading. Finish current task, recommend fresh session.`,
        };
      }

      return behavioral;
    }

    case "BLOCKED":
      return {
        rules: [
          ...mandatoryRules,
          "MODE: Enter plan mode. Analyze the blocker. Present options to the user. Do not edit files.",
          "Present the decision to the user exactly as described.",
          "Do not suggest a preferred option unless the user asks for your opinion.",
          "After the user decides, relay the answer immediately. Do not elaborate.",
        ],
        tone: "Brief. The user is making a decision, not having a discussion.",
      };

    case "COMPLETED":
      return {
        rules: [
          ...mandatoryRules,
          "Report the completion summary. Do not start new work.",
          "If the user wants to continue, they start a new spec.",
        ],
        tone: "Concise. Celebrate briefly, then stop.",
      };

    default:
      return {
        rules: [
          ...mandatoryRules,
          `Run \`${cs("next", specName)}\` to get your instructions.`,
          "Do not take action without noskills guidance.",
        ],
        tone: "Neutral. Waiting for direction.",
      };
  }
};

// =============================================================================
// Compiler
// =============================================================================

const STALE_SESSION_MS = 5 * 60 * 1000; // 5 minutes

const buildEnforcement = (
  hints: InteractionHints,
): EnforcementInfo | undefined => {
  const hasHooks = hints.hasSubAgentDelegation;
  const level = hasHooks ? "enforced" : "behavioral";

  if (level === "enforced") {
    return {
      level,
      capabilities: [
        "PreToolUse file edit gate",
        "Git write guard",
        "Stop iteration tracking",
        "PostToolUse file logging",
        "Sub-agent delegation",
      ],
    };
  }

  return {
    level,
    capabilities: ["Behavioral rules only"],
    gaps: [
      "File edits not blocked in non-execution phases",
      "Git write commands not blocked",
      "No iteration tracking",
      "No file change logging",
      "No sub-agent delegation available",
    ],
  };
};

const buildMeta = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  hints: InteractionHints = DEFAULT_HINTS,
): MetaBlock => {
  const specName = state.spec;
  let resumeHint: string;

  switch (state.phase) {
    case "IDLE":
      resumeHint = `No active spec. Start one with: \`${
        c('spec new --name=<slug> "description"')
      }\``;
      break;
    case "DISCOVERY":
      resumeHint =
        `Discovery in progress for "${state.spec}". ${state.discovery.answers.length} questions answered so far.`;
      break;
    case "DISCOVERY_REFINEMENT":
      resumeHint =
        `Discovery answers ready for review. ${state.discovery.answers.length} answers collected. Waiting for user confirmation.`;
      break;
    case "SPEC_PROPOSAL":
      resumeHint =
        `Spec draft ready for review at ${state.specState.path}. Waiting for approval.`;
      break;
    case "SPEC_APPROVED":
      resumeHint =
        `Spec "${state.spec}" is approved. Waiting to start execution.`;
      break;
    case "EXECUTING":
      resumeHint = state.execution.lastProgress !== null
        ? `Executing "${state.spec}", iteration ${state.execution.iteration}. Last progress: ${state.execution.lastProgress}. Continue with the current task.`
        : `Executing "${state.spec}", iteration ${state.execution.iteration}. Start the first task.`;
      break;
    case "BLOCKED":
      resumeHint =
        `Execution blocked: ${state.execution.lastProgress}. Ask the user to resolve.`;
      break;
    case "COMPLETED":
      resumeHint =
        `Spec "${state.spec}" completed in ${state.execution.iteration} iterations.`;
      break;
    default:
      resumeHint = `Run \`${cs("next", specName)}\` to get started.`;
  }

  const enforcement = buildEnforcement(hints);

  return {
    protocol: `Run \`${
      cs('next --answer="..."', specName)
    }\` to submit results and advance`,
    spec: state.spec,
    branch: state.branch,
    iteration: state.execution.iteration,
    lastProgress: state.execution.lastProgress,
    activeConcerns: activeConcerns.map((c) => c.id),
    resumeHint,
    enforcement,
  };
};

const buildProtocolGuide = (
  state: schema.StateFile,
): ProtocolGuide | undefined => {
  const specName = state.spec;

  if (state.lastCalledAt === null) {
    // First call ever — include guide
    return {
      what:
        "noskills orchestrates your work: IDLE → DISCOVERY → DISCOVERY_REFINEMENT → SPEC_PROPOSAL → SPEC_APPROVED → EXECUTING → DONE → IDLE",
      how: `Run \`${
        cs("next", specName)
      }\` for instructions. Submit results with \`${
        cs('next --answer="..."', specName)
      }\`. Never make architectural decisions without asking.`,
      currentPhase: state.phase,
    };
  }

  const lastCalled = new Date(state.lastCalledAt).getTime();
  const now = Date.now();

  if (now - lastCalled > STALE_SESSION_MS) {
    return {
      what:
        "noskills orchestrates your work: IDLE → DISCOVERY → DISCOVERY_REFINEMENT → SPEC_PROPOSAL → SPEC_APPROVED → EXECUTING → DONE → IDLE",
      how: `Run \`${
        cs("next", specName)
      }\` for instructions. Submit results with \`${
        cs('next --answer="..."', specName)
      }\`. Never make architectural decisions without asking.`,
      currentPhase: state.phase,
    };
  }

  return undefined;
};

// =============================================================================
// Roadmap — ASCII phase indicator for every output
// =============================================================================

const ROADMAP_PHASES = [
  { key: "IDLE", label: "IDLE" },
  { key: "DISCOVERY", label: "DISCOVERY" },
  { key: "DISCOVERY_REFINEMENT", label: "REFINEMENT" },
  { key: "SPEC_PROPOSAL", label: "PROPOSAL" },
  { key: "SPEC_APPROVED", label: "APPROVED" },
  { key: "EXECUTING", label: "EXECUTING" },
  { key: "COMPLETED", label: "COMPLETED" },
  { key: "IDLE_END", label: "IDLE" },
] as const;

const buildRoadmap = (phase: schema.Phase): string => {
  if (phase === "BLOCKED") {
    // Show EXECUTING highlighted with BLOCKED note
    return ROADMAP_PHASES.map((p) =>
      p.key === "EXECUTING" ? `[ EXECUTING (BLOCKED) ]` : p.label
    ).join(" → ");
  }
  // Highlight current phase — IDLE highlights the first IDLE in the roadmap
  return ROADMAP_PHASES.map((p) => {
    if (p.key === "IDLE" && phase === "IDLE") return `[ IDLE ]`;
    if (p.key === phase) return `[ ${p.label} ]`;
    return p.label;
  }).join(" → ");
};

const buildGate = (
  state: schema.StateFile,
  parsedSpec?: ParsedSpec | null,
): GateInfo | undefined => {
  switch (state.phase) {
    case "DISCOVERY_REFINEMENT": {
      // Surface completeness status — if spec.md is active, check placeholder coverage
      const report = livingSpec.checkSpecCompleteness(state.specState);
      const answersInfo =
        `${state.discovery.answers.length}/6 answers collected.`;
      if (!report.canAdvance) {
        const blockerCount = report.unresolvedSections.length +
          report.pendingDecisions.length;
        return {
          message:
            `${answersInfo} Spec incomplete: ${blockerCount} item(s) need resolution before advancing.`,
          action:
            "Resolve every placeholder + pending decision before approving. Do NOT advance until 100%. " +
            `Unresolved: ${
              report.unresolvedSections.map((s) => s.sectionTitle).join(", ") ||
              "none"
            }. ` +
            `Pending: ${
              report.pendingDecisions.map((d) => d.section).join(", ") || "none"
            }.`,
          phase: "DISCOVERY_REFINEMENT",
        };
      }
      return {
        message: `${answersInfo} All sections resolved.`,
        action: "Type APPROVE to generate spec, or REVISE to correct answers.",
        phase: "DISCOVERY_REFINEMENT",
      };
    }
    case "SPEC_APPROVED": {
      const taskCount = parsedSpec?.tasks?.length ?? 0;
      return {
        message: `Spec approved. ${taskCount} tasks ready.`,
        action: "Type START to begin execution.",
        phase: "SPEC_APPROVED",
      };
    }
    default:
      return undefined;
  }
};

/** Extra context for IDLE phase — specs, rules count. Loaded by callers. */
export type IdleContext = {
  readonly existingSpecs?: readonly SpecSummary[];
  readonly rulesCount?: number;
};

export const compile = async (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
  config?: schema.NosManifest | null,
  parsedSpec?: ParsedSpec | null,
  folderRuleCriteria?: readonly FolderRule[],
  idleContext?: IdleContext,
  interactionHints?: InteractionHints,
  currentUser?: { name: string; email: string },
  tier2Count?: number,
  projectRoot?: string,
): Promise<NextOutput> => {
  const hints = interactionHints ?? DEFAULT_HINTS;
  const meta = buildMeta(state, activeConcerns, hints);
  const maxIter = config?.maxIterationsBeforeRestart ?? 15;
  const allowGit = config?.allowGit ?? false;
  let behavioral = buildBehavioral(
    state,
    maxIter,
    allowGit,
    activeConcerns,
    parsedSpec,
    hints,
    config,
  );

  // Inject tier2 summary for EXECUTING phase
  if (state.phase === "EXECUTING") {
    const ruleT2 = tier2Count ?? 0;
    const reminderT2 = concerns.splitRemindersByTier(activeConcerns).tier2
      .length;
    const totalT2 = ruleT2 + reminderT2;
    if (totalT2 > 0) {
      behavioral = {
        ...behavioral,
        tier2Summary:
          `${totalT2} file-specific rules delivered via PreToolUse hook when editing matching files.`,
      };
    }
  }

  const protocolGuide = buildProtocolGuide(state);

  let phaseOutput: PhaseOutput;

  switch (state.phase) {
    case "IDLE":
      phaseOutput = compileIdle(
        activeConcerns,
        DEFAULT_CONCERNS,
        rules.length,
        idleContext,
      );
      break;
    case "DISCOVERY":
      phaseOutput = await compileDiscovery(
        state,
        activeConcerns,
        rules,
        currentUser,
        projectRoot,
      );
      break;
    case "DISCOVERY_REFINEMENT":
      phaseOutput = compileDiscoveryReview(state, activeConcerns);
      break;
    case "SPEC_PROPOSAL":
      phaseOutput = compileSpecDraft(state);
      break;
    case "SPEC_APPROVED":
      phaseOutput = compileSpecApproved(state);
      break;
    case "EXECUTING":
      phaseOutput = compileExecution(
        state,
        activeConcerns,
        rules,
        maxIter,
        parsedSpec,
        folderRuleCriteria,
      );
      break;
    case "BLOCKED":
      phaseOutput = compileBlocked(state);
      break;
    case "COMPLETED":
      phaseOutput = await compileCompleted(state, projectRoot);
      break;
    default:
      phaseOutput = compileIdle(
        activeConcerns,
        DEFAULT_CONCERNS,
        rules.length,
        idleContext,
      );
  }

  // Build the output with meta + behavioral + roadmap + optional extras
  const roadmap = buildRoadmap(state.phase);
  const gate = buildGate(state, parsedSpec);
  let result: NextOutput = {
    ...phaseOutput,
    meta,
    behavioral,
    roadmap,
  } as NextOutput;

  if (gate !== undefined) {
    result = { ...result, gate } as NextOutput;
  }

  if (protocolGuide !== undefined) {
    result = { ...result, protocolGuide } as NextOutput;
  }

  // Soft recommendation: consider /clear after task completion (not enforced)

  // Inject machine-readable mode directive for the current phase
  const modeDirective = PHASE_MODE_DIRECTIVES[state.phase];
  if (modeDirective !== undefined) {
    result = { ...result, modeDirective } as NextOutput;
  }

  // Append phase-aware interactive options (except EXECUTING — agent should work)
  // Options are always included for programmatic consumers; presentation adapts per tool.
  const internalOptions = buildInteractiveOptions(
    state,
    activeConcerns,
    idleContext,
    phaseOutput,
  );
  if (internalOptions.length > 0) {
    const options: InteractiveOption[] = internalOptions.map((
      { label, description },
    ) => ({ label, description }));
    const cmdMap: Record<string, string> = {};
    for (const opt of internalOptions) {
      cmdMap[opt.label] = opt.command;
    }

    // Tool hint adapts based on the active tool's interaction model
    const toolHint = hints.optionPresentation === "tool"
      ? "AskUserQuestion"
      : "prose-numbered-list";
    const toolHintInstruction = hints.optionPresentation === "tool"
      ? "Use AskUserQuestion tool to present these options. Do NOT use prose."
      : "Present options as a numbered list. Ask user to pick a number.";

    result = {
      ...result,
      interactiveOptions: options,
      commandMap: cmdMap,
      toolHint,
      toolHintInstruction,
    } as NextOutput;
  }

  return result;
};

// =============================================================================
// Interactive Options — phase-aware choices for agent UX
// =============================================================================

const buildInteractiveOptions = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  idleContext?: IdleContext,
  phaseOutput?: PhaseOutput,
): readonly InternalOption[] => {
  const specName = state.spec;

  switch (state.phase) {
    case "DISCOVERY": {
      const discoveryOut = phaseOutput as DiscoveryOutput | undefined;
      if (discoveryOut?.activePlanDetected !== undefined) {
        const detected = discoveryOut.activePlanDetected;
        return [
          {
            label: `Convert plan (${detected.age})`,
            description:
              `Import ${detected.path} as STATED pre-fill for discovery`,
            command: cs('next --answer="import-plan"', specName),
          },
          {
            label: "Share my own context",
            description: "Start fresh — tell me what you want to build",
            command: cs('next --answer="<your context here>"', specName),
          },
        ];
      }
      return [];
    }

    case "IDLE": {
      const opts: InternalOption[] = [];
      const specs = idleContext?.existingSpecs ?? [];

      // Continuable specs (not COMPLETED)
      const continuable = specs.filter((s) => s.phase !== "COMPLETED");

      if (activeConcerns.length === 0) {
        opts.push({
          label: "Add concerns (Recommended)",
          description:
            "Shape how discovery and specs work by adding project concerns",
          command: c("concern add <id> [<id2> ...]"),
        });
      }

      opts.push({
        label: "Start a new spec",
        description:
          "Tell me what you want to build — a one-liner, detailed requirements, meeting notes, anything",
        command: c('spec new "description"'),
      });

      // Add continuable specs as options (max 2 to stay within AskUserQuestion limits)
      for (const spec of continuable.slice(0, 2)) {
        opts.push({
          label: `Continue: ${spec.name} (${spec.phase})`,
          description: spec.detail ?? `Iteration ${spec.iteration}`,
          command: cs("next", spec.name),
        });
      }

      if (activeConcerns.length > 0) {
        opts.push({
          label: "Edit concerns",
          description: `Currently: ${
            activeConcerns.map((c) => c.id).join(", ")
          }`,
          command: c("concern list"),
        });
      }

      // AskUserQuestion maxItems is 4 — trim if needed
      return opts.slice(0, 4);
    }

    case "DISCOVERY_REFINEMENT": {
      // Two sub-phases: answer review vs split decision
      if (state.discovery.approved) {
        // Approved + split detected → show keep/split options
        return [
          {
            label: "Keep as one spec",
            description: "All work in a single spec",
            command: cs('next --answer="keep"', specName),
          },
          {
            label: "Split into separate specs",
            description: "Create one spec per independent area",
            command: cs('next --answer="split"', specName),
          },
        ];
      }
      // Not yet approved → show approve/revise options
      return [
        {
          label: "Approve all answers",
          description: "Answers look correct — generate the spec",
          command: cs('next --answer="approve"', specName),
        },
        {
          label: "Revise answers",
          description: "Correct one or more discovery answers",
          command: cs("next --answer='{\"revise\":{...}}'", specName),
        },
      ];
    }

    case "SPEC_PROPOSAL":
      return [
        {
          label: "Approve spec",
          description: "Review looks good — approve and move to execution",
          command: cs("approve", specName),
        },
        {
          label: "Refine spec",
          description: "Submit refinements to improve tasks or sections",
          command: cs('next --answer=\'{"refinement":"..."}\'', specName),
        },
        {
          label: "Save for later",
          description:
            "Keep the draft as-is. Others can review, add ACs, notes, or tasks. Come back anytime to approve.",
          command: cs('next --answer="save"', specName),
        },
        {
          label: "Start over",
          description: "Reset the spec and start fresh",
          command: cs("reset", specName),
        },
      ];

    case "SPEC_APPROVED":
      return [
        {
          label: "Start execution",
          description: "Begin implementing the tasks",
          command: cs('next --answer="start"', specName),
        },
        {
          label: "Save for later",
          description:
            "Spec is approved but don't start execution yet. Others can still add ACs or notes.",
          command: cs('next --answer="save"', specName),
        },
      ];

    case "EXECUTING":
      return []; // Agent should be working

    case "BLOCKED":
      return [
        {
          label: "Resolve block",
          description: "Provide a resolution to unblock execution",
          command: cs('next --answer="resolution"', specName),
        },
        {
          label: "Reset spec",
          description: "Abandon this spec and start over",
          command: cs("reset", specName),
        },
      ];

    case "COMPLETED":
      return [
        {
          label: "New spec",
          description: "Start a new feature spec",
          command: c('spec new --name=<slug> "description"'),
        },
        {
          label: "Reopen spec",
          description: "Reopen this spec for revision",
          command: cs("reopen", specName),
        },
        {
          label: "Check status",
          description: "Review completed spec summary",
          command: c("status"),
        },
      ];

    default:
      return [];
  }
};

// =============================================================================
// Phase Compilers
// =============================================================================

const WELCOME =
  "noskills is a state-machine orchestrator that acts as a scrum master for both you and your agent — keeping work focused, decisions in your hands, and tokens efficient.";

const compileIdle = (
  activeConcerns: readonly schema.ConcernDefinition[],
  allConcernDefs: readonly schema.ConcernDefinition[],
  rulesCount: number,
  idleContext?: IdleContext,
): IdleOutput => ({
  phase: "IDLE",
  instruction: (idleContext?.existingSpecs ?? []).length === 0
    ? 'No specs yet. Ask the user: "What do you want to build?" — accept any input, then run `noskills spec new "their answer"` immediately. Do NOT list options or ask clarifying questions first.'
    : 'No active spec. If the user described what they want, run `noskills spec new "description"` immediately — name is auto-generated. Present ALL available concerns (split across multiple calls if needed).',
  welcome: WELCOME,
  existingSpecs: idleContext?.existingSpecs ?? [],
  availableConcerns: allConcernDefs.map((c) => ({
    id: c.id,
    description: c.description,
  })),
  activeConcerns: activeConcerns.map((c) => c.id),
  activeRulesCount: idleContext?.rulesCount ?? rulesCount,
  behavioralNote:
    "These options are fallbacks. If the user already described what they want, act on it directly without presenting these options.",
  hint: activeConcerns.length === 0
    ? "No concerns active. Consider adding concerns first — they shape discovery questions and specs."
    : undefined,
});

// =============================================================================
// Pre-discovery Research — extract version-pinned tech terms from description
// =============================================================================

/**
 * Regex to extract version-pinned technology references from spec descriptions.
 * Matches patterns like "Node.js 25+", "Deno 2.7+", "React 19", "Python 3.12", "Go 1.25+"
 */
const VERSION_TERM_PATTERN =
  /\b(Node\.?js|Deno|Bun|Go|Rust|Python|Ruby|Java|Kotlin|Swift|PHP|React|Vue|Angular|Svelte|Next\.?js|Nuxt|Remix|Astro|SolidJS|Qwik|TypeScript|Webpack|Vite|esbuild|Rollup|Terraform|Docker|Kubernetes|PostgreSQL|MySQL|Redis|MongoDB|SQLite|Prisma|Drizzle|gRPC|GraphQL|tRPC)\s+v?(\d+(?:\.\d+)?(?:\.\d+)?\+?)\b/gi;

const extractVersionTerms = (description: string | null): readonly string[] => {
  if (description === null || description.length === 0) return [];

  const terms: string[] = [];
  let match;
  const re = new RegExp(VERSION_TERM_PATTERN.source, "gi");

  while ((match = re.exec(description)) !== null) {
    terms.push(`${match[1]} ${match[2]}`);
  }

  return terms;
};

const buildPreDiscoveryResearch = (
  description: string | null,
): PreDiscoveryResearch | undefined => {
  const terms = extractVersionTerms(description);

  if (terms.length === 0) return undefined;

  return {
    required: true,
    instruction:
      "Before asking discovery questions, research the current state of all platforms, runtimes, libraries, and APIs mentioned in the spec description. Use web search and Context7 MCP if available. Report findings as a pre-discovery brief to the user. Do NOT assume your training data is current — versions change, APIs get added, features get deprecated.",
    extractedTerms: terms,
  };
};

const MAX_PLAN_SIZE = 50 * 1024;

const buildPlanContext = async (
  planPath: string | null,
): Promise<PlanContext | undefined> => {
  if (planPath === null) return undefined;

  try {
    const content = await runtime.fs.readTextFile(planPath);
    if (content.length > MAX_PLAN_SIZE) return undefined;

    return {
      provided: true,
      content,
      instruction:
        "A plan document was provided. Read it carefully, extract relevant information for each discovery question, and present pre-filled answers for user review. Do NOT skip any question — present your extraction and let the user confirm, correct, or expand. IMPORTANT: When extracting answers from the plan, mark each extraction as [STATED] (directly written in the plan) or [INFERRED] (your interpretation). Present extractions individually for confirmation.",
    };
  } catch {
    return undefined;
  }
};

// =============================================================================
// Phase Mode Directives
// =============================================================================

// UNINITIALIZED intentionally absent — modeDirective is omitted for that phase.
const PHASE_MODE_DIRECTIVES: Partial<Record<schema.Phase, string>> = {
  IDLE: "No active spec. Plan mode optional.",
  DISCOVERY: "Ensure you are in plan mode. Read-only. Analyze, research, ask.",
  DISCOVERY_REFINEMENT:
    "Ensure you are in plan mode. Read-only. Review answers, resolve placeholders.",
  SPEC_PROPOSAL:
    "Ensure you are in plan mode. Use ultraplan if available. Generate implementation map with file dependencies and execution order.",
  SPEC_APPROVED: "Exit plan mode. Prepare for execution.",
  EXECUTING:
    "Ensure you have exited plan mode. Sub-agents need full write access.",
  BLOCKED: "Enter plan mode. Analyze the blocker. Present options to user.",
  COMPLETED: "Plan mode optional. Review, record learnings.",
};

/** Returns the mode directive for a phase, or undefined for UNINITIALIZED. */
export const getPhaseModeDirective = (
  phase: schema.Phase,
): string | undefined => PHASE_MODE_DIRECTIVES[phase];

// =============================================================================
// Active Plan Detection
// =============================================================================

export type DetectedPlan = {
  readonly path: string;
  readonly age: number; // ms since modified
  readonly ageLabel: string; // "just now" | "45m ago" | "2h ago"
  readonly preview: string; // first 2-3 non-empty non-frontmatter lines, max 200 chars
  readonly quality: "ok" | "sparse"; // "ok" = nonWS >= 100 AND has "## " heading
};

/**
 * Scans project root for a recent plan file (plan.md / PLAN.md / .claude/plan.md).
 * Returns null if none found, file is older than 24h, or file is >50 KB.
 * First match wins (candidates checked in order).
 */
export const detectActivePlan = async (
  projectRoot: string,
): Promise<DetectedPlan | null> => {
  const candidates = [
    `${projectRoot}/plan.md`,
    `${projectRoot}/PLAN.md`,
    `${projectRoot}/.claude/plan.md`,
  ];

  for (const p of candidates) {
    try {
      // FileInfo from @eserstack/standards has mtime/birthtime directly — no cast needed
      const stat = await runtime.fs.stat(p);
      const modified = stat.mtime ?? stat.birthtime;
      // Files where both are null cannot satisfy the 24h gate reliably — skip
      if (!modified) continue;
      const age = Date.now() - new Date(modified).getTime();
      if (age > 24 * 60 * 60 * 1000) continue; // 24h gate
      const content = await runtime.fs.readTextFile(p);
      if (content.length > MAX_PLAN_SIZE) continue; // reuse module constant
      // Strip YAML frontmatter
      const stripped = content.replace(/^---[\s\S]*?---\n?/, "");
      const nonEmpty = stripped.split("\n").filter((l) => l.trim().length > 0);
      const preview = nonEmpty.slice(0, 3).join("\n").slice(0, 200);
      const nonWS = stripped.replace(/\s/g, "").length;
      const hasHeading = /^## /m.test(stripped);
      // AND: both conditions required — a stub with just "## Tasks" heading is still sparse
      const quality: "ok" | "sparse" = (nonWS >= 100 && hasHeading)
        ? "ok"
        : "sparse";
      const ageLabel = age < 60_000
        ? "just now"
        : Math.floor(age / 3_600_000) > 0
        ? `${Math.floor(age / 3_600_000)}h ago`
        : `${Math.floor((age % 3_600_000) / 60_000)}m ago`;
      return { path: p, age, ageLabel, preview, quality };
    } catch {
      continue;
    }
  }
  return null;
};

/** Generate follow-up hints based on answer content. */
const generateFollowUpHints = (answer: string): readonly string[] => {
  const hints: string[] = [];
  const lower = answer.toLowerCase();

  // Technology mentions
  const techPatterns = [
    "websocket",
    "graphql",
    "grpc",
    "redis",
    "postgres",
    "mongodb",
    "kafka",
    "rabbitmq",
    "docker",
    "kubernetes",
    "lambda",
    "s3",
  ];
  for (const tech of techPatterns) {
    if (lower.includes(tech)) {
      hints.push(
        `Answer mentions ${tech} — consider: error handling, versioning, fallback strategy`,
      );
    }
  }

  // Vague signals
  if (
    lower.includes("should work") || lower.includes("standard approach") ||
    lower.includes("probably") || lower.includes("i think") ||
    lower.includes("not sure")
  ) {
    hints.push("Answer is vague — ask for specifics");
  }

  // Scope signals
  if (
    lower.includes("and also") || lower.includes("we might") ||
    lower.includes("could also") || lower.includes("maybe we should")
  ) {
    hints.push("Scope expansion signal — clarify if in scope or deferred");
  }

  // Risk signals
  if (
    lower.includes("tricky") || lower.includes("complicated") ||
    lower.includes("risky") || lower.includes("not sure about")
  ) {
    hints.push("Risk signal — dig deeper into what makes it risky");
  }

  // Dependency signals
  if (
    lower.includes("depends on") || lower.includes("after") ||
    lower.includes("blocked by") || lower.includes("waiting for")
  ) {
    hints.push(
      "Dependency detected — clarify what happens if dependency isn't ready",
    );
  }

  // Performance/scale
  if (
    lower.includes("real-time") || lower.includes("scalab") ||
    lower.includes("performance") || lower.includes("latency") ||
    lower.includes("concurrent")
  ) {
    hints.push(
      "Performance/scale mention — ask about limits, degradation, monitoring",
    );
  }

  return hints;
};

const getModeRules = (mode: schema.DiscoveryMode): readonly string[] => {
  switch (mode) {
    case "full":
      return [
        "Ask each discovery question as written. Push for specific, concrete answers.",
        "If the answer is vague, ask follow-up questions before accepting.",
      ];
    case "validate":
      return [
        "The user has a plan. Your job is to challenge it, not explore it.",
        "For each question, identify assumptions and ask: 'What would prove this wrong?'",
        "If the description already answers a question, present your understanding and ask to confirm.",
        "When pre-filling answers from a rich description, plan, or prior discussion, DISTINGUISH between what the user EXPLICITLY STATED and what you INFERRED. Format each pre-filled item as: '[STATED] GPU skinning in all 3 renderers — you said this during technical discussion' or '[INFERRED] tangent space is 10-star scope — I assumed this based on complexity'. The user confirms stated items and corrects inferred items.",
        "Present pre-filled answers ONE ITEM AT A TIME for confirmation, not as a completed block. The user's job is to correct your inferences, not rubber-stamp your summary. If you pre-fill 5 items and 2 are wrong, the user must be able to catch them individually.",
      ];
    case "technical-depth":
      return [
        "Focus on architecture, data flow, performance, and integration points.",
        "Before each question, scan the codebase for related implementations.",
        "Ask: 'How does this interact with [existing system]?' for each integration point.",
      ];
    case "ship-fast":
      return [
        "Focus on minimum viable scope.",
        "For each question, also ask: 'What can we defer to a follow-up?'",
        "Push for the smallest version that delivers value.",
      ];
    case "explore":
      return [
        "Think bigger. What's the 10x version?",
        "For each question, ask about adjacent opportunities.",
        "Suggest possibilities the user might not have considered.",
      ];
  }
};

const computeContributors = (
  answers:
    readonly (schema.DiscoveryAnswer | schema.AttributedDiscoveryAnswer)[],
  currentUser?: { name: string; email: string },
): readonly DiscoveryContributor[] => {
  const userMap = new Map<string, number>();
  for (const a of answers) {
    const name = "user" in a
      ? (a as schema.AttributedDiscoveryAnswer).user
      : "Unknown User";
    if (currentUser !== undefined && name === currentUser.name) continue;
    userMap.set(name, (userMap.get(name) ?? 0) + 1);
  }
  return [...userMap.entries()].map(([name, count]) => ({
    name,
    contributions: `${count} answer${count > 1 ? "s" : ""}`,
  }));
};

const compileDiscovery = async (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
  currentUser?: { name: string; email: string },
  projectRoot?: string,
): Promise<DiscoveryOutput> => {
  const specName = state.spec;
  const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
  const answeredCount = state.discovery.answers.length;
  const allAnswered = questions.isDiscoveryComplete(state.discovery.answers);
  const isAgent = state.discovery.audience === "agent";

  // Compute optional multi-user fields (only present when data exists)
  const contributors = computeContributors(
    state.discovery.answers,
    currentUser,
  );
  const specNotes = (state.specNotes ?? [])
    .filter((n) => !n.text.startsWith("[TASK] "))
    .map((n) => ({ text: n.text, user: n.user }));

  const multiUserFields: {
    currentUser?: { name: string; email: string };
    previousContributors?: readonly DiscoveryContributor[];
    notes?: readonly { text: string; user: string }[];
  } = {
    ...(currentUser !== undefined ? { currentUser } : {}),
    ...(contributors.length > 0 ? { previousContributors: contributors } : {}),
    ...(specNotes.length > 0 ? { notes: specNotes } : {}),
  };

  // ── Listen first step (before mode selection) ──
  // When spec is brand new, ask the user to share context before jumping into
  // discovery mode selection. Skip if user already provided context or if
  // there's a plan document.
  const hasUserContext = state.discovery.userContext !== undefined &&
    state.discovery.userContext.length > 0;
  const hasDescription = state.specDescription !== null &&
    state.specDescription.length > 0;
  const hasPlan = state.discovery.planPath !== null;
  const mode = state.discovery.mode;

  if (
    mode === undefined && !hasUserContext && answeredCount === 0 && !hasPlan &&
    hasDescription
  ) {
    // Auto-detect a recent plan file in the project root
    let detectedPlan: DetectedPlan | null = null;
    if (projectRoot !== undefined) {
      detectedPlan = await detectActivePlan(projectRoot);
    }

    const planWarning = detectedPlan?.quality === "sparse"
      ? "\n⚠ The plan appears sparse — limited content detected."
      : "";
    const planNotice = detectedPlan !== null
      ? `\n\nA plan.md was detected (${detectedPlan.ageLabel}, ${detectedPlan.path}).${planWarning}\nYou can import it or share your own context directly.`
      : "";

    const listenOutput: DiscoveryOutput = {
      phase: "DISCOVERY",
      instruction:
        "The user just created this spec. Before starting discovery, ask them to share whatever context they have — requirements, notes, tasks, or just a brief description. Say: 'Tell me about this — share as much context as you have.' Listen first, then proceed." +
        planNotice,
      questions: [],
      answeredCount: 0,
      context: {
        rules,
        concernReminders: concerns.getReminders(activeConcerns) as string[],
      },
      transition: {
        onComplete: cs(
          'next --answer="<user context or just start>"',
          specName,
        ),
      },
      ...multiUserFields,
      ...(detectedPlan !== null
        ? {
          activePlanDetected: {
            path: detectedPlan.path,
            age: detectedPlan.ageLabel,
            preview: detectedPlan.preview,
            quality: detectedPlan.quality,
          },
        }
        : {}),
    };

    if (currentUser !== undefined) {
      return { ...listenOutput, currentUser };
    }
    return listenOutput;
  }

  // Inject planImported flag when a plan is already in state
  const planImportedField = hasPlan ? { planImported: true as const } : {};

  // ── Mode selection step (after user context is received) ──
  if (mode === undefined && hasDescription && answeredCount === 0 && !hasPlan) {
    const modeOutput: DiscoveryOutput = {
      phase: "DISCOVERY",
      instruction:
        "Before starting discovery, select the discovery mode that best fits this spec.",
      questions: [],
      answeredCount: 0,
      context: {
        rules,
        concernReminders: concerns.getReminders(activeConcerns) as string[],
      },
      transition: { onComplete: cs('next --answer="<mode>"', specName) },
      modeSelection: {
        required: true,
        instruction: "Select the discovery mode.",
        options: [
          {
            id: "full",
            label: "Full discovery",
            description:
              "Standard 6 questions with all concern extras. Default for new features.",
          },
          {
            id: "validate",
            label: "Validate my plan",
            description:
              "I already know what I want — challenge my assumptions, find gaps.",
          },
          {
            id: "technical-depth",
            label: "Technical depth",
            description:
              "Focus on architecture, data flow, performance, integration points.",
          },
          {
            id: "ship-fast",
            label: "Ship fast",
            description:
              "Minimum viable scope. What can we defer? What's the MVP?",
          },
          {
            id: "explore",
            label: "Explore scope",
            description:
              "Think bigger. 10x version? Adjacent opportunities? What are we missing?",
          },
        ],
      },
    };

    // Inject learnings from previous specs
    let enrichedMode = modeOutput;
    if (projectRoot !== undefined) {
      try {
        const relevant = await learningsModule.getRelevantLearnings(
          projectRoot,
          state.specDescription ?? "",
        );
        if (relevant.length > 0) {
          enrichedMode = {
            ...enrichedMode,
            previousLearnings: learningsModule.formatLearnings(relevant),
          };
        }
      } catch {
        // best effort
      }
    }

    if (currentUser !== undefined) {
      return { ...enrichedMode, currentUser };
    }
    return enrichedMode;
  }

  // ── Premise challenge step (after mode, before Q1) ──
  // Skip for states without mode set (backward compat)
  const premisesCompleted = state.discovery.premisesCompleted === true;
  if (mode !== undefined && !premisesCompleted && !allAnswered) {
    // Mode-aware forcing questions — YC office-hours style for full/validate,
    // narrowest-wedge only for ship-fast, brainstorm framing for explore.
    const forcingPrompts: readonly string[] = mode === "ship-fast"
      ? [
        "Narrowest Wedge: What's the absolute minimum version of this that creates real, measurable value — without any surrounding features?",
      ]
      : mode === "explore"
      ? [
        "Demand Reality: What do users actually do today when they can't use this feature? Describe concrete workarounds — not hypothetical ones.",
        "Status Quo: Why hasn't this been solved before? What existing solution is insufficient, and specifically where does it break down?",
        "Desperate Specificity: Describe the exact moment a real user feels this pain — who, where, what did they do next?",
        "Narrowest Wedge: What's the smallest version of this that creates real value?",
        "Observation & Surprise: What's the most surprising thing you know about this problem or this user?",
        "Think bigger: If this works perfectly, what's the 10x version? What should you build next?",
      ]
      : [
        // mode=full, mode=validate, mode=technical-depth — full YC office-hours set
        "Demand Reality: What do users actually do today when they can't use this feature? Describe concrete workarounds — not hypothetical ones.",
        "Status Quo: Why hasn't this been solved before? What existing solution is insufficient, and specifically where does it break down?",
        "Desperate Specificity: Describe the exact moment a real user feels this pain. Name them if possible. What did they do next?",
        "Narrowest Wedge: What's the smallest version of this that creates real, measurable value — without the surrounding features?",
        "Observation & Surprise: What's the most surprising thing you've learned from watching real users encounter this problem?",
        "Future-Fit: If this works perfectly in 6 months, what should you build next? Does that constrain any decisions you're making now?",
      ];

    const premiseOutput: DiscoveryOutput = {
      phase: "DISCOVERY",
      instruction:
        "Before asking discovery questions, challenge the premises of this spec.",
      questions: [],
      answeredCount: 0,
      context: {
        rules,
        concernReminders: concerns.getReminders(activeConcerns) as string[],
      },
      transition: {
        onComplete: cs("next --answer='{\"premises\":[...]}'", specName),
      },
      ...planImportedField,
      premiseChallenge: {
        required: true,
        instruction: "Read the spec description" +
          (state.discovery.planPath !== null ? " and the plan document" : "") +
          '. Identify 2-4 premises the spec assumes. Present each premise and ask the user to agree or disagree. Submit as JSON: {"premises":[{"text":"...","agreed":true/false,"revision":"..."}]}',
        prompts: forcingPrompts as string[],
      },
    };
    if (currentUser !== undefined) {
      return { ...premiseOutput, currentUser };
    }
    return premiseOutput;
  }

  // ── Mode-specific rules injection (only when mode is explicitly set) ──
  const modeRules = mode !== undefined ? getModeRules(mode) : [];
  const rulesWithMode = [...rules, ...modeRules];

  // ── Rich description detection ──
  const specDescription = state.specDescription ?? "";
  const isRichDescription = specDescription.length > 500;

  // ── Premise context for subsequent questions ──
  const premises = state.discovery.premises ?? [];
  const agreedPremises = premises.filter((p) => p.agreed).map((p) => p.text);
  const revisedPremises = premises
    .filter((p) => !p.agreed && p.revision !== undefined)
    .map((p) => ({
      original: p.text,
      revision: p.revision!,
    }));

  if (allAnswered) {
    const history = state.revisitHistory ?? [];
    const lastRevisit = history.length > 0 ? history[history.length - 1] : null;
    const base: DiscoveryOutput = {
      phase: "DISCOVERY",
      instruction: lastRevisit !== null
        ? "This spec was revisited from EXECUTING. All previous answers are preserved. Review and approve, or revise answers before regenerating the spec."
        : `All discovery questions answered. Run: \`${
          cs("approve", specName)
        }\``,
      questions: [],
      answeredCount,
      context: { rules, concernReminders: [] },
      transition: { onComplete: cs("approve", specName) },
      ...multiUserFields,
      ...planImportedField,
    };

    if (lastRevisit !== null && lastRevisit !== undefined) {
      const entry = lastRevisit;
      return {
        ...base,
        revisited: true,
        revisitReason: entry.reason,
        previousProgress: {
          completedTasks: [...entry.completedTasks],
          totalTasks: entry.completedTasks.length,
        },
      };
    }

    return base;
  }

  // ── Agent mode: return only the current question ──
  if (isAgent) {
    const currentIdx = state.discovery.currentQuestion;
    const currentQ = allQuestions[currentIdx];

    if (currentQ === undefined) {
      return {
        phase: "DISCOVERY",
        instruction: `All discovery questions answered. Run: \`${
          cs("approve", specName)
        }\``,
        questions: [],
        answeredCount,
        context: { rules, concernReminders: [] },
        transition: { onComplete: cs("approve", specName) },
        ...multiUserFields,
      };
    }

    const question: DiscoveryQuestion = {
      id: currentQ.id,
      text: currentQ.text,
      concerns: [...currentQ.concerns],
      extras: currentQ.extras.map((e) => e.text),
    };

    const agentOutput: DiscoveryOutput = {
      phase: "DISCOVERY",
      instruction:
        `Ask this question to the user using AskUserQuestion. Submit the answer with: \`${
          cs('next --agent --answer="<answer>"', specName)
        }\``,
      questions: [question],
      answeredCount,
      currentQuestion: currentIdx,
      totalQuestions: allQuestions.length,
      context: {
        rules: rulesWithMode,
        concernReminders: concerns.getReminders(activeConcerns) as string[],
      },
      transition: {
        onComplete: `${cs('next --agent --answer="<answer>"', specName)}`,
      },
      ...multiUserFields,
      ...planImportedField,
    };

    // Enrich with premise context if available
    let enrichedAgent: DiscoveryOutput = agentOutput;
    if (agreedPremises.length > 0 || revisedPremises.length > 0) {
      enrichedAgent = {
        ...enrichedAgent,
        ...(agreedPremises.length > 0 ? { agreedPremises } : {}),
        ...(revisedPremises.length > 0 ? { revisedPremises } : {}),
      };
    }

    // Only inject preDiscoveryResearch, planContext, and richDescription on Q1
    if (currentIdx === 0) {
      const research = buildPreDiscoveryResearch(
        state.specDescription ?? null,
      );
      if (research !== undefined) {
        enrichedAgent = { ...enrichedAgent, preDiscoveryResearch: research };
      }

      const planCtx = await buildPlanContext(state.discovery.planPath ?? null);
      if (planCtx !== undefined) {
        enrichedAgent = { ...enrichedAgent, planContext: planCtx };
      }

      // Rich description detection (Q1 only, when no plan context)
      if (isRichDescription && planCtx === undefined) {
        enrichedAgent = {
          ...enrichedAgent,
          richDescription: {
            provided: true,
            length: specDescription.length,
            content: specDescription,
            instruction:
              "The user provided a detailed description. For each question, extract relevant info and present as a pre-filled suggestion. IMPORTANT: When extracting answers from the description, mark each extraction as [STATED] (directly written by the user) or [INFERRED] (your interpretation). Present extractions individually for confirmation.",
          },
        };
      }
    }

    // Enrich with follow-up hints and pending follow-ups
    const pendingFU = (state.discovery.followUps ?? []).filter(
      (f) => f.status === "pending",
    );
    if (pendingFU.length > 0) {
      enrichedAgent = { ...enrichedAgent, pendingFollowUps: pendingFU };
    }

    // Generate follow-up hints based on the last answered question
    const lastAnswer = state.discovery.answers.length > 0
      ? state.discovery.answers[state.discovery.answers.length - 1]!
      : undefined;
    if (lastAnswer !== undefined) {
      const hints = generateFollowUpHints(lastAnswer.answer);
      if (hints.length > 0) {
        enrichedAgent = { ...enrichedAgent, followUpHints: hints };
      }
    }

    if (enrichedAgent !== agentOutput) return enrichedAgent;

    return agentOutput;
  }

  // ── Human mode: return ALL unanswered questions in one batch ──
  const answeredIds = new Set(state.discovery.answers.map((a) => a.questionId));
  const unanswered: DiscoveryQuestion[] = allQuestions
    .filter((q) => !answeredIds.has(q.id))
    .map((q) => ({
      id: q.id,
      text: q.text,
      concerns: [...q.concerns],
      extras: q.extras.map((e) => e.text),
    }));

  // Check for revisit context
  const history = state.revisitHistory ?? [];
  const lastRevisit = history.length > 0 ? history[history.length - 1] : null;
  const isRevisited = lastRevisit !== null;
  const revisitInstruction = isRevisited
    ? "This spec was revisited from EXECUTING. Previous discovery answers are preserved — review and revise as needed, or approve to regenerate tasks."
    : "Conduct a thorough discovery conversation. FIRST: perform a pre-discovery codebase scan (README, CLAUDE.md, recent git log, TODOs, directory structure) and present a brief audit summary. THEN: challenge the user's spec description against your findings. THEN: ask the discovery questions one at a time, offering concrete options based on codebase knowledge. AFTER questions: present a dream state table (current → this spec → future), scored expansion proposals, architectural decisions, and an error/rescue map. FINALLY: present a complete discovery synthesis for user confirmation before submitting answers as a JSON object.";

  const output: DiscoveryOutput = {
    phase: "DISCOVERY",
    instruction: revisitInstruction,
    questions: unanswered,
    answeredCount,
    context: {
      rules: rulesWithMode,
      concernReminders: concerns.getReminders(activeConcerns) as string[],
    },
    transition: {
      onComplete: `${
        cs(
          'next --answer=\'{"status_quo":"...","ambition":"...",...}\'',
          specName,
        )
      }`,
    },
    ...multiUserFields,
    ...planImportedField,
    ...(agreedPremises.length > 0 ? { agreedPremises } : {}),
    ...(revisedPremises.length > 0 ? { revisedPremises } : {}),
  };

  if (isRevisited && lastRevisit !== undefined) {
    return {
      ...output,
      revisited: true,
      revisitReason: lastRevisit.reason,
      previousProgress: {
        completedTasks: [...lastRevisit.completedTasks],
        totalTasks: lastRevisit.completedTasks.length,
      },
    };
  }

  // Inject preDiscoveryResearch, planContext, and richDescription on first call (no answers yet)
  if (answeredCount === 0) {
    let enriched = output;

    const research = buildPreDiscoveryResearch(state.specDescription ?? null);
    if (research !== undefined) {
      enriched = { ...enriched, preDiscoveryResearch: research };
    }

    const planCtx = await buildPlanContext(state.discovery.planPath ?? null);
    if (planCtx !== undefined) {
      enriched = { ...enriched, planContext: planCtx };
    }

    // Rich description detection (first call, when no plan context)
    if (isRichDescription && planCtx === undefined) {
      enriched = {
        ...enriched,
        richDescription: {
          provided: true,
          length: specDescription.length,
          content: specDescription,
          instruction:
            "The user provided a detailed description. For each question, extract relevant info and present as a pre-filled suggestion.",
        },
      };
    }

    if (enriched !== output) return enriched;
  }

  return output;
};

const compileDiscoveryReview = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
): DiscoveryReviewOutput => {
  const specName = state.spec;
  const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
  const reviewAnswers: DiscoveryReviewAnswer[] = state.discovery.answers.map(
    (a) => {
      const q = allQuestions.find((q) => q.id === a.questionId);
      return {
        questionId: a.questionId,
        question: q?.text ?? a.questionId,
        answer: a.answer,
      };
    },
  );

  // Analyze for potential spec split
  const splitProposal = splitDetector.analyzeForSplit(
    state.discovery.answers,
  );

  // Sub-phases:
  // 1. Not yet approved → user reviews answers, approves or revises
  // 2. Approved + split detected → user decides keep vs split
  // 3. Approved + (no split or split decided) + alternatives not presented → alternatives prompt
  // 4. All done → normal transition
  if (state.discovery.approved && splitProposal.detected) {
    return {
      phase: "DISCOVERY_REFINEMENT",
      instruction:
        "Discovery answers are approved. noskills detected multiple independent work areas in this spec. Present the split proposal to the user and let them decide whether to keep as one spec or split into separate specs.",
      answers: reviewAnswers,
      transition: {
        onApprove: cs('next --answer="keep"', specName),
        onRevise: cs(
          'next --answer=\'{"revise":{"status_quo":"corrected answer"}}\'',
          specName,
        ),
      },
      splitProposal,
    };
  }

  // Check if alternatives step is needed
  const alternativesPresented = state.discovery.alternativesPresented === true;
  if (state.discovery.approved && !alternativesPresented) {
    return {
      phase: "DISCOVERY_REFINEMENT",
      subPhase: "alternatives",
      instruction:
        "Based on discovery answers, propose 2-3 distinct implementation approaches. Present each with name, summary, effort (S/M/L/XL), risk (Low/Med/High), pros, and cons. Ask the user to choose one, or skip.",
      answers: reviewAnswers,
      transition: {
        onApprove: cs(
          'next --answer=\'{"approach":"A","name":"...","summary":"...","effort":"M","risk":"Low"}\'',
          specName,
        ),
        onRevise: cs('next --answer="skip"', specName),
      },
      alternatives: {
        required: true,
        instruction:
          "Generate 2-3 approaches from discovery answers and codebase. Present via AskUserQuestion.",
        format: {
          fields: ["id", "name", "summary", "effort", "risk", "pros", "cons"],
        },
      },
    };
  }

  // Jidoka C1: batch-submitted answers get stronger confirmation language
  const batchWarning = state.discovery.batchSubmitted === true
    ? " IMPORTANT: These answers were BATCH-SUBMITTED (not confirmed one-by-one). You MUST present EVERY answer individually and get explicit user confirmation for each. Do NOT auto-approve."
    : "";

  // Build review checklist from concern review dimensions
  const allDimensions = concerns.getReviewDimensions(activeConcerns);
  const registryIds = concerns.getRegistryDimensionIds(activeConcerns);
  let reviewChecklist: ReviewChecklist | undefined;

  if (allDimensions.length > 0) {
    const checklistDimensions: ReviewChecklistDimension[] = allDimensions.map(
      (dim) => ({
        id: dim.id,
        label: dim.label,
        prompt: dim.prompt,
        evidenceRequired: dim.evidenceRequired,
        isRegistry: registryIds.includes(dim.id),
        concernId: dim.concernId,
      }),
    );

    const hasRegistries = checklistDimensions.some((d) => d.isRegistry);
    reviewChecklist = {
      dimensions: checklistDimensions,
      instruction:
        "Before approving, review the plan against each dimension below. For dimensions marked evidenceRequired, cite specific files or code. Present findings to the user for each dimension via AskUserQuestion — one dimension at a time.",
      ...(hasRegistries
        ? {
          registryInstruction:
            "Registry dimensions (isRegistry=true) require a structured table with every row filled. These tables will be included in the generated spec.",
        }
        : {}),
    };
  }

  // Task-11: when auto-inference has populated classification at the
  // DISCOVERY → REFINEMENT transition, surface a calm-prose preview so the
  // user can approve or toggle before the spec is generated.
  const classificationPreview =
    state.classification !== null && state.classification.source === "inferred"
      ? formatClassificationPreview(state.classification)
      : undefined;

  return {
    phase: "DISCOVERY_REFINEMENT",
    instruction: splitProposal.detected
      ? `Present ALL discovery answers to the user for review. ALSO present the split proposal — noskills detected multiple independent areas.${batchWarning}`
      : `Present ALL discovery answers to the user for review. The user must confirm or correct each answer before the spec can be generated. Use AskUserQuestion to ask for confirmation.${batchWarning}`,
    answers: reviewAnswers,
    transition: {
      onApprove: cs('next --answer="approve"', specName),
      onRevise: cs(
        'next --answer=\'{"revise":{"status_quo":"corrected answer"}}\'',
        specName,
      ),
    },
    splitProposal: splitProposal.detected ? splitProposal : undefined,
    reviewChecklist,
    classificationPreview,
    subPhase: machine.getDiscoveryRefinementStage(state),
    completenessScore: state.discovery.refinement?.completenessScore,
    reviewPosture: state.discovery.refinement?.reviewPosture,
  };
};

const compileSpecDraft = (state: schema.StateFile): SpecDraftOutput => {
  const specName = state.spec;

  // If classification not yet provided, ask for it before showing spec
  if (state.classification === null) {
    return {
      phase: "SPEC_PROPOSAL",
      instruction:
        "Before generating the spec, classify what this spec involves. Ask the user to select all that apply.",
      specPath: state.specState.path ?? "",
      transition: {
        onApprove: `${
          cs(
            'next --answer=\'{"involvesWebUI":false,"involvesCLI":false,"involvesPublicAPI":false,"involvesMigration":false,"involvesDataHandling":false}\'',
            specName,
          )
        }`,
      },
      classificationRequired: true,
      classificationPrompt: {
        options: [
          {
            id: "involvesWebUI",
            label:
              "Web/Mobile UI — layouts, responsive design, visual components",
          },
          {
            id: "involvesCLI",
            label:
              "CLI/Terminal UI — spinners, progress bars, interactive prompts",
          },
          { id: "involvesPublicAPI", label: "Public API changes" },
          {
            id: "involvesMigration",
            label: "Data migration or schema changes",
          },
          { id: "involvesDataHandling", label: "Data handling or privacy" },
        ],
        instruction: "Select all that apply. Submit as JSON: `" +
          cs(
            'next --answer=\'{"involvesWebUI":true,"involvesCLI":false,"involvesPublicAPI":false,...}\'',
            specName,
          ) +
          "`. If none apply, answer with: `" +
          cs('next --answer="none"', specName) +
          "`",
      },
    };
  }

  return {
    phase: "SPEC_PROPOSAL",
    instruction: "Spec draft is ready. Self-review before presenting to user.",
    specPath: state.specState.path ?? "",
    transition: { onApprove: cs("approve", specName) },
    selfReview: {
      required: true,
      checks: [
        "Placeholder scan: no TBD, TODO, vague requirements",
        "Consistency: tasks match discovery, ACs match tasks",
        "Scope: single spec, not multiple independent subsystems",
        "Ambiguity: every AC has one interpretation",
      ],
      instruction:
        "Review draft against these checks. Fix issues inline before presenting to user. Do not ask user to fix — fix it yourself.",
    },
  };
};

const compileSpecApproved = (state: schema.StateFile): SpecApprovedOutput => {
  const specName = state.spec;

  return {
    phase: "SPEC_APPROVED",
    instruction:
      "Spec is approved and ready. When the user is ready to start, begin execution.",
    specPath: state.specState.path ?? "",
    transition: { onStart: `${cs('next --answer="start"', specName)}` },
  };
};

/**
 * Check if an individual acceptance criterion is relevant based on classification.
 * Uses keyword matching on the AC text — same approach as section relevance in template.ts.
 * ACs that don't match any classification keyword are always relevant.
 */
const isACRelevant = (
  acText: string,
  classification: schema.SpecClassification | null,
): boolean => {
  if (classification === null) return false;

  const lower = acText.toLowerCase();

  // Web-only ACs (mobile layout, responsive design)
  if (
    lower.includes("mobile") || lower.includes("layout") ||
    lower.includes("interaction design")
  ) {
    return classification.involvesWebUI;
  }

  // Any UI ACs (loading states, skeleton UI)
  if (lower.includes("ui state") || lower.includes("skeleton ui")) {
    return classification.involvesWebUI || classification.involvesCLI;
  }

  // Documentation ACs (README, docs) — always relevant
  if (
    lower.includes("readme") || lower.includes("documentation updated") ||
    lower.includes("reflected in") && lower.includes("docs")
  ) {
    return true;
  }

  // Public API documentation ACs
  if (lower.includes("api doc") || lower.includes("public api")) {
    return classification.involvesPublicAPI;
  }

  // Migration and backward compatibility ACs
  if (
    lower.includes("migration") || lower.includes("backward compat") ||
    lower.includes("deprecat")
  ) {
    return classification.involvesMigration;
  }

  // Data handling and audit ACs
  if (
    lower.includes("audit trail") || lower.includes("access control") ||
    lower.includes("data handling") || lower.includes("data retention")
  ) {
    return classification.involvesDataHandling;
  }

  // Default: relevant (general quality ACs always apply)
  return true;
};

const buildAcceptanceCriteria = (
  activeConcerns: readonly schema.ConcernDefinition[],
  verifyFailed: boolean,
  verifyOutput: string,
  debt: schema.DebtState | null,
  classification: schema.SpecClassification | null,
  parsedSpec?: ParsedSpec | null,
  folderRuleCriteria?: readonly FolderRule[],
  naItems?: readonly string[],
  criteriaScope?: "task" | "review-gate",
  gateConcernCursor?: number,
): readonly AcceptanceCriterion[] => {
  // ── Review gate: emit one concern's review dimensions as criteria ──
  // All spec tasks are complete; evaluate against the actual implementation.
  if (criteriaScope === "review-gate") {
    const concernsWithDims = activeConcerns.filter(
      (c) => (c.reviewDimensions ?? []).length > 0,
    );
    const cursor = gateConcernCursor ?? 0;
    const currentConcern = concernsWithDims[cursor];
    if (currentConcern === undefined) return [];

    const dims = concerns.getReviewDimensions([currentConcern], classification);
    return dims.map((dim) => ({
      id: `gate-${currentConcern.id}-${dim.id}`,
      text: `(${currentConcern.id} — ${dim.label}) ${dim.prompt}${
        dim.evidenceRequired
          ? " [EVIDENCE REQUIRED — cite file paths, line numbers, or test names]"
          : ""
      }`,
    }));
  }

  const criteria: AcceptanceCriterion[] = [];
  const naSet = new Set(naItems ?? []);
  let acCounter = 0;
  const nextId = (): string => `ac-${++acCounter}`;

  // Debt items from previous iterations come first (use their existing IDs)
  if (debt !== null) {
    for (const item of debt.items) {
      if (naSet.has(item.id)) continue; // skip N/A'd items
      criteria.push({
        id: item.id,
        text: `[DEBT from iteration ${item.since}] ${item.text}`,
      });
    }
  }

  // Automated verification result
  if (verifyFailed) {
    criteria.push({
      id: nextId(),
      text: `[FAILED] Tests — fix this first: ${verifyOutput.slice(0, 200)}`,
    });
  }

  // Task-specific verification from spec (the actual acceptance criteria)
  if (parsedSpec !== null && parsedSpec !== undefined) {
    for (const item of parsedSpec.verification) {
      const id = nextId();
      if (naSet.has(id)) continue; // skip N/A'd items
      criteria.push({ id, text: item });
    }
  }

  // Concern-injected criteria — filtered per-AC by classification keywords
  for (const concern of activeConcerns) {
    if (
      concern.acceptanceCriteria !== undefined &&
      concern.acceptanceCriteria.length > 0
    ) {
      for (const ac of concern.acceptanceCriteria) {
        if (!isACRelevant(ac, classification)) continue;
        const id = nextId();
        if (naSet.has(id)) continue; // skip N/A'd items
        criteria.push({ id, text: `(${concern.id}) ${ac}` });
      }
    }
  }

  // Folder-scoped rules from .folder-rules.md files
  if (folderRuleCriteria !== undefined) {
    for (const fr of folderRuleCriteria) {
      const id = nextId();
      if (naSet.has(id)) continue; // skip N/A'd items
      criteria.push({
        id,
        text: `(folder: ${fr.folder}) ${fr.rule}`,
      });
    }
  }

  // Jidoka I4: scope violation check when task declares files
  if (parsedSpec !== null && parsedSpec !== undefined) {
    const currentTask = parsedSpec.tasks?.find((t) =>
      t.files !== undefined && t.files.length > 0
    );
    if (currentTask?.files !== undefined && currentTask.files.length > 0) {
      criteria.push({
        id: "scope-check",
        text: `Scope check: only files listed in task (${
          currentTask.files.join(", ")
        }) should be modified. Report any out-of-scope changes with justification.`,
      });
    }
  }

  // Mandatory ACs — always injected, cannot be N/A'd without justification
  criteria.push({
    id: "mandatory-tests",
    text: "Tests written and passing for all new and changed behavior",
  });
  criteria.push({
    id: "mandatory-docs",
    text: "Documentation updated for all public-facing changes",
  });

  return criteria;
};

const compileExecution = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
  maxIterationsBeforeRestart: number,
  parsedSpec?: ParsedSpec | null,
  folderRuleCriteria?: readonly FolderRule[],
): ExecutionOutput => {
  const specName = state.spec;
  const tensions = concerns.detectTensions(activeConcerns);
  const shouldRestart = state.execution.iteration >= maxIterationsBeforeRestart;
  const verifyFailed = state.execution.lastVerification?.passed === false;
  const verifyOutput = state.execution.lastVerification?.output ?? "";

  // Find current task from parsed spec
  const specTasks = parsedSpec?.tasks ?? [];
  const completedIds = state.execution.completedTasks ?? [];
  const completedSet = new Set(completedIds);
  const nextTask = specTasks.find((t) => !completedSet.has(t.id)) ?? null;
  const taskBlock: TaskBlock | undefined = nextTask !== null
    ? {
      id: nextTask.id,
      title: nextTask.title,
      totalTasks: specTasks.length,
      completedTasks: completedIds.length,
      ...(nextTask.files !== undefined && nextTask.files.length > 0
        ? { files: nextTask.files }
        : {}),
    }
    : undefined;

  // Status report requested — agent must check off criteria before proceeding
  if (state.execution.awaitingStatusReport) {
    const criteriaScope = state.execution.criteriaScope;
    const gateConcernCursor = state.execution.gateConcernCursor;

    const criteria = buildAcceptanceCriteria(
      activeConcerns,
      verifyFailed,
      verifyOutput,
      state.execution.debt,
      state.classification,
      parsedSpec,
      folderRuleCriteria,
      state.execution.naItems,
      criteriaScope,
      gateConcernCursor,
    );

    // ── Review gate instruction (post-implementation review) ──
    let batchInstruction: string;
    if (criteriaScope === "review-gate") {
      const concernsWithDims = activeConcerns.filter(
        (c) => (c.reviewDimensions ?? []).length > 0,
      );
      const cursor = gateConcernCursor ?? 0;
      const currentConcern = concernsWithDims[cursor];
      const total = concernsWithDims.length;
      batchInstruction = currentConcern !== undefined
        ? `REVIEW GATE (${
          cursor + 1
        }/${total}): Evaluate the ${currentConcern.name} concern dimensions against the actual implementation. ` +
          `Point to specific files, line numbers, and test names. ` +
          `File edits are BLOCKED — this is a review-only pass. ` +
          `Submit: noskills next --answer='{"completed":[...],"remaining":[...]}'`
        : "Review gate complete — submit to advance.";
    } else {
      // ── Normal task instruction ──
      // Detect batch task claims from lastProgress
      let batchTaskIds: string[] = [];
      try {
        const prevAnswer = JSON.parse(
          state.execution.lastProgress ?? "",
        );
        if (Array.isArray(prevAnswer.completed)) {
          batchTaskIds = (prevAnswer.completed as string[]).filter(
            (id: string) => typeof id === "string" && id.startsWith("task-"),
          );
        }
      } catch {
        // Not batch JSON
      }

      batchInstruction = batchTaskIds.length >= 2
        ? `${batchTaskIds.length} tasks reported complete. Report status against ALL relevant acceptance criteria.`
        : "Before this task is accepted, report your completion status against these acceptance criteria.";
    }

    let output: ExecutionOutput = {
      phase: "EXECUTING",
      instruction: batchInstruction,
      context: {
        rules,
        concernReminders: concerns.splitRemindersByTier(activeConcerns)
          .tier1 as string[],
      },
      transition: {
        onComplete: `${
          cs(
            'next --answer=\'{"completed":[...],"remaining":[...],"blocked":[...]}\'',
            specName,
          )
        }`,
        onBlocked: criteriaScope !== "review-gate"
          ? `${cs('block "reason"', specName)}`
          : undefined,
        iteration: state.execution.iteration,
      },
      statusReportRequired: true,
      statusReport: {
        criteria,
        reportFormat: criteriaScope === "review-gate"
          ? {
            completed:
              "list dimension IDs you verified with evidence (file:line, test name)",
            remaining: "list dimension IDs not yet verified",
            blocked:
              "list dimension IDs that need a decision before you can verify",
          }
          : {
            completed:
              "list item IDs you finished (e.g., ['debt-1', 'ac-3']) with evidence",
            remaining: "list item IDs not yet done",
            blocked: "list item IDs that need a decision from the user",
            na:
              "(optional) list item IDs that are not applicable to this task — they will be removed from future criteria",
            newIssues:
              "(optional) list NEW issues discovered during implementation — free text, will be assigned debt IDs automatically",
          },
      },
      ...(criteriaScope === "review-gate"
        ? { subphase: "review-gate" as const }
        : {}),
    };

    if (criteriaScope !== "review-gate") {
      // Batch task claims only relevant in task mode
      let batchTaskIds: string[] = [];
      try {
        const prevAnswer = JSON.parse(
          state.execution.lastProgress ?? "",
        );
        if (Array.isArray(prevAnswer.completed)) {
          batchTaskIds = (prevAnswer.completed as string[]).filter(
            (id: string) => typeof id === "string" && id.startsWith("task-"),
          );
        }
      } catch {
        // Not batch JSON
      }
      if (batchTaskIds.length >= 2) {
        output = { ...output, batchTasks: batchTaskIds };
      }
    }

    if (verifyFailed && criteriaScope !== "review-gate") {
      output = {
        ...output,
        verificationFailed: true,
        verificationOutput: verifyOutput.slice(0, 2000),
      };
    }

    return output;
  }

  // Check if the previous status report rejected the task
  const wasRejected = (state.execution.lastProgress ?? "").includes(
    "Task not accepted",
  );
  const debtItems = state.execution.debt?.items ?? [];
  const debtUnaddressed = state.execution.debt?.unaddressedIterations ?? 0;

  // Normal execution — include current task inline
  const taskInstruction = taskBlock !== undefined
    ? `Execute task ${taskBlock.id}: ${taskBlock.title} (${taskBlock.completedTasks}/${taskBlock.totalTasks} completed)`
    : "All tasks completed. Run `" + cs("done", specName) + "` to finish.";

  let baseInstruction: string;
  if (verifyFailed) {
    baseInstruction =
      "Verification FAILED. Fix the failing tests before continuing.";
  } else if (wasRejected && debtItems.length > 0) {
    const urgency = debtUnaddressed >= 3
      ? ` These items have been outstanding for ${debtUnaddressed} iterations.`
      : "";
    baseInstruction =
      `Task not accepted — ${debtItems.length} remaining item(s) must be addressed before this task can be completed.${urgency} Address them, then submit a new status report.`;
  } else {
    baseInstruction = taskInstruction;
  }

  let output: ExecutionOutput = {
    phase: "EXECUTING",
    instruction: baseInstruction,
    task: taskBlock,
    context: {
      rules,
      concernReminders: concerns.splitRemindersByTier(activeConcerns)
        .tier1 as string[],
    },
    transition: {
      onComplete: `${cs('next --answer="..."', specName)}`,
      onBlocked: `${cs('block "reason"', specName)}`,
      iteration: state.execution.iteration,
    },
  };

  // Task rejection info — tells agent explicitly why it's stuck
  if (wasRejected && debtItems.length > 0) {
    output = {
      ...output,
      taskRejected: true,
      rejectionReason:
        `${debtItems.length} remaining item(s) must be addressed.`,
      rejectionRemaining: debtItems.map((d) => d.text),
    };
  }

  // Carry forward debt from previous iterations
  if (state.execution.debt !== null && state.execution.debt.items.length > 0) {
    const unaddressed = state.execution.debt.unaddressedIterations ?? 0;
    const debtNote = unaddressed >= 3
      ? `URGENT: These items have been unaddressed for ${unaddressed} iterations. Address them IMMEDIATELY before any new work.`
      : "These were not completed in a previous iteration. Address them BEFORE starting new work.";

    output = {
      ...output,
      previousIterationDebt: {
        fromIteration: state.execution.debt.fromIteration,
        items: state.execution.debt.items,
        note: debtNote,
      },
    };
  }

  if (verifyFailed) {
    const truncated = verifyOutput.slice(0, 2000);
    output = {
      ...output,
      verificationFailed: true,
      verificationOutput: truncated,
    };
  }

  // Jidoka I6: tensions are a blocking gate — require explicit user resolution
  if (tensions.length > 0) {
    const tensionList = tensions.map((t) =>
      `${t.between.join(" vs ")}: ${t.issue}`
    ).join("; ");
    output = {
      ...output,
      concernTensions: tensions,
      instruction:
        `TENSION GATE: ${tensions.length} concern tension(s) detected: ${tensionList}. You MUST present these to the user and get explicit resolution for each before proceeding. Use AskUserQuestion to ask which side to prioritize.`,
    };
  }

  if (shouldRestart) {
    output = {
      ...output,
      restartRecommended: true,
      restartInstruction:
        `Context may be getting large after ${state.execution.iteration} iterations. Consider starting a new conversation and running \`${
          cs("next", specName)
        }\` to resume - your progress is saved.`,
    };
  }

  // Show promote prompt for the most recent unpromoted decision
  const lastUnpromoted = [...state.decisions]
    .reverse()
    .find((d) => !d.promoted);

  if (
    lastUnpromoted !== undefined &&
    state.execution.lastProgress?.startsWith("Resolved:")
  ) {
    output = {
      ...output,
      promotePrompt: {
        decisionId: lastUnpromoted.id,
        question: lastUnpromoted.question,
        choice: lastUnpromoted.choice,
        prompt:
          `You just resolved a decision: "${lastUnpromoted.choice}". Ask the user: "Should this be a permanent rule for future specs too?" If yes, run: \`${
            c(`rule add "${lastUnpromoted.choice}"`)
          }\``,
      },
    };
  }

  // Pre-execution review on first iteration
  if (state.execution.iteration === 0 && !verifyFailed && !wasRejected) {
    output = {
      ...output,
      preExecutionReview: {
        instruction:
          "Re-read spec before starting. Flag: missing info that will block mid-execution, wrong task order, unclear ACs. Better to catch now than mid-execution.",
      },
    };
  }

  // Design checklist when beautiful-product concern is active
  const hasBeautifulProduct = activeConcerns.some((cc) =>
    cc.id === "beautiful-product"
  );
  if (hasBeautifulProduct) {
    output = {
      ...output,
      designChecklist: {
        required: true,
        instruction:
          "Before completing any UI task, rate your implementation 0-10 on these dimensions and include the ratings in your AC report:",
        dimensions: [
          {
            id: "hierarchy",
            label:
              "Information hierarchy — what does the user see first, second, third?",
          },
          {
            id: "states",
            label:
              "Interaction states — loading, empty, error, success all specified?",
          },
          {
            id: "edge-cases",
            label:
              "Edge cases — long text, zero results, slow connection handled?",
          },
          {
            id: "intentionality",
            label:
              "Overall intentionality — does this feel designed or generated?",
          },
        ],
      },
    };
  }

  return output;
};

const compileBlocked = (state: schema.StateFile): BlockedOutput => {
  const specName = state.spec;

  return {
    phase: "BLOCKED",
    instruction: "A decision is needed. Ask the user.",
    reason: state.execution.lastProgress ?? "Unknown",
    transition: { onResolved: `${cs('next --answer="..."', specName)}` },
  };
};

const compileCompleted = async (
  state: schema.StateFile,
  projectRoot?: string,
): Promise<CompletedOutput> => {
  // Jidoka M1: learning pending flag — always true until user submits learnings
  const learningsPending = true;

  const base: CompletedOutput = {
    phase: "COMPLETED",
    summary: {
      spec: state.spec,
      iterations: state.execution.iteration,
      decisionsCount: state.decisions.length,
      completionReason: state.completionReason,
      completionNote: state.completionNote,
    },
    learningPrompt: {
      instruction:
        `LEARNING PENDING — Record learnings before moving on. For each insight, decide: one-time learning or permanent rule? One-time ("assumed X, was Y") → \`learn "text"\`. Permanent ("always/never do X") → \`learn "text" --rule\`. Run: \`noskills spec ${
          state.spec ?? "<name>"
        } learn "text"\` or \`learn "text" --rule\`.`,
      examples: [
        `noskills spec ${
          state.spec ?? "upload"
        } learn "Assumed S3 SDK v2, was v3"`,
        `noskills spec ${
          state.spec ?? "upload"
        } learn "Always use Result types" --rule`,
        `noskills learn promote 1`,
      ],
    },
    learningsPending,
  };

  // Check for stale diagrams
  if (projectRoot !== undefined) {
    try {
      const { checkStaleness } = await import("../dashboard/diagrams.ts");
      const stale = await checkStaleness(
        projectRoot,
        state.execution.modifiedFiles as string[],
      );
      if (stale.length > 0) {
        // Jidoka M4: stale diagrams are blocking — must be resolved before done
        return {
          ...base,
          staleDiagrams: stale.map((s) => ({
            file: s.file,
            line: s.line,
            reason: s.reason,
          })),
          staleDiagramsBlocking: true,
        };
      }
    } catch {
      // best effort
    }
  }

  return base;
};
