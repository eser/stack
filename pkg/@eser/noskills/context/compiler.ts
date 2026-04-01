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
import type { InteractionHints } from "../sync/adapter.ts";
import { DEFAULT_CONCERNS } from "../defaults/concerns/mod.ts";
import * as questions from "./questions.ts";
import * as concerns from "./concerns.ts";
import * as splitDetector from "./split-detector.ts";
import type { ParsedSpec } from "../spec/parser.ts";
import type { FolderRule } from "./folder-rules.ts";
import { cmd as _cmd } from "../output/cmd.ts";

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

export type FreeOutput = {
  readonly phase: "FREE";
  readonly instruction: string;
};

export type PhaseOutput =
  | DiscoveryOutput
  | DiscoveryReviewOutput
  | SpecDraftOutput
  | SpecApprovedOutput
  | ExecutionOutput
  | BlockedOutput
  | CompletedOutput
  | IdleOutput
  | FreeOutput;

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

export type PreviousProgress = {
  readonly completedTasks: readonly string[];
  readonly totalTasks: number;
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
};

export type DiscoveryReviewAnswer = {
  readonly questionId: string;
  readonly question: string;
  readonly answer: string;
};

export type DiscoveryReviewOutput = {
  readonly phase: "DISCOVERY_REVIEW";
  readonly instruction: string;
  readonly answers: readonly DiscoveryReviewAnswer[];
  readonly transition: {
    readonly onApprove: string;
    readonly onRevise: string;
  };
  readonly splitProposal?: splitDetector.SplitProposal;
};

export type ClassificationPrompt = {
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  readonly instruction: string;
};

export type SpecDraftOutput = {
  readonly phase: "SPEC_DRAFT";
  readonly instruction: string;
  readonly specPath: string;
  readonly transition: {
    readonly onApprove: string;
  };
  readonly classificationRequired?: boolean;
  readonly classificationPrompt?: ClassificationPrompt;
};

export type SpecApprovedOutput = {
  readonly phase: "SPEC_APPROVED";
  readonly instruction: string;
  readonly specPath: string;
  readonly transition: {
    readonly onStart: string;
  };
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
    readonly na: string;
    readonly newIssues: string;
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
};

export type ExecutionOutput = {
  readonly phase: "EXECUTING";
  readonly instruction: string;
  readonly task?: TaskBlock;
  readonly batchTasks?: readonly string[];
  readonly context: ContextBlock;
  readonly transition: {
    readonly onComplete: string;
    readonly onBlocked: string;
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
  readonly hint?: string;
};

export type ContextBlock = {
  readonly rules: readonly string[];
  readonly concernReminders: readonly string[];
};

// =============================================================================
// Meta Block — self-documenting resume context for every output
// =============================================================================

export type MetaBlock = {
  readonly protocol: string;
  readonly spec: string | null;
  readonly branch: string | null;
  readonly iteration: number;
  readonly lastProgress: string | null;
  readonly activeConcerns: readonly string[];
  readonly resumeHint: string;
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
};

// Invariant: applies to every phase, every output. Non-negotiable.
const GIT_READONLY_RULE =
  "NEVER run git write commands (commit, add, push, checkout, stash, reset, merge, rebase, cherry-pick). Git is read-only for agents. The user controls git. You may read: git log, git diff, git status, git show, git blame.";

/** Default interaction hints — Claude Code behavior. */
const DEFAULT_HINTS: InteractionHints = {
  hasAskUserTool: true,
  optionPresentation: "tool",
  hasSubAgentDelegation: true,
  subAgentMethod: "task",
};

const buildBehavioral = (
  state: schema.StateFile,
  maxIterationsBeforeRestart: number,
  allowGit: boolean,
  parsedSpec?: ParsedSpec | null,
  hints: InteractionHints = DEFAULT_HINTS,
): BehavioralBlock => {
  const stale = state.execution.iteration >= maxIterationsBeforeRestart;
  const ROLE_IDENTITY_RULE =
    "You are a senior engineer and a scrum master who takes pride in honest reporting. Your reputation depends on accuracy, not speed. You are responsible for others' toil, and you are a perfect example of a servant leader. When reporting progress: if something is NOT implemented, say so — don't hide it. If partially done, say 'partially done: [what works] / [what doesn't]'. If untested, say 'implemented but untested'. NEVER say 'done' for something you haven't verified yourself. Underpromise — 4 of 6 done means '4 of 6 done, 2 remaining', not 'almost done'.";
  const EXPLICIT_OVER_CLEVER_RULE =
    "Never skip steps or make decisions without asking the user. If you think something can be skipped or inferred, ask first. Explicit > Clever.";

  // Decision point rule adapts based on whether the tool has AskUserQuestion
  const DECISION_POINT_RULE = hints.hasAskUserTool
    ? "At every decision point (discovery questions, classification, spec approval, expansion proposals, architectural decisions, rule promotion), you MUST use AskUserQuestion to get the user's input. You MUST NOT make decisions, infer preferences, or assume the user's intent. If you're unsure whether something is a decision point, it is — ask."
    : "At every decision point (discovery questions, classification, spec approval, expansion proposals, architectural decisions, rule promotion), you MUST ask the user. Present options as a numbered list and ask the user to pick a number. You MUST NOT make decisions, infer preferences, or assume the user's intent. If you're unsure whether something is a decision point, it is — ask.";

  const RECOMMENDATION_RULE =
    "At every decision point where you present options to the user, share your recommendation BEFORE asking. Say what you think and why, then ask if the user agrees. Format: 'I'd recommend X because [reason]. Agree, or would you prefer Y?' The user always has the final word, but you save them cognitive load by proposing first.";
  const LIVE_STATE_MACHINE_RULE =
    "noskills is a live state machine the user watches in real-time. Call noskills ONCE per interaction. Ask ONE question, wait for the user's answer, submit it. Never batch-submit, never backfill, never answer questions yourself.";
  const mandatoryRules = allowGit
    ? [
      ROLE_IDENTITY_RULE,
      EXPLICIT_OVER_CLEVER_RULE,
      DECISION_POINT_RULE,
      RECOMMENDATION_RULE,
      LIVE_STATE_MACHINE_RULE,
    ]
    : [
      GIT_READONLY_RULE,
      ROLE_IDENTITY_RULE,
      EXPLICIT_OVER_CLEVER_RULE,
      DECISION_POINT_RULE,
      RECOMMENDATION_RULE,
      LIVE_STATE_MACHINE_RULE,
    ];
  const ROADMAP_GATE_RULE =
    "When noskills output contains a `roadmap` field, display it to the user BEFORE any other content. When output contains a `gate` field, display the gate message prominently — do NOT bury it in prose.";
  mandatoryRules.push(ROADMAP_GATE_RULE);
  const scopeItems = parsedSpec?.outOfScope ?? [];

  const specName = state.spec;

  switch (state.phase) {
    case "FREE":
      return {
        rules: [],
        tone: "Quiet. No enforcement.",
      };

    case "IDLE": {
      const idleOptionRules: string[] = hints.optionPresentation === "tool"
        ? [
          "When interactiveOptions are present, pass them DIRECTLY as the `options` array in AskUserQuestion — they are already in the correct {label, description} format. You MUST also provide a `header` field (max 12 chars, e.g. 'Action') and a `question` field. When the user picks an option, look up its label in the `commandMap` object to find the command to execute.",
          "For availableConcerns: use AskUserQuestion with multiSelect:true. AskUserQuestion supports max 4 options per question and max 4 questions per call. If there are more than 4 concerns, split them across two questions within the same AskUserQuestion call (e.g., first 3 in question 1, remaining in question 2). NEVER silently drop concerns — present ALL available concerns to the user, even if it requires multiple questions.",
        ]
        : [
          "When interactiveOptions are present, present them as a numbered list. For each option show the number, label, and description. Ask the user to pick a number. When the user picks an option, look up its label in the `commandMap` object to find the command to execute. Example format:\n\n1. Start a new spec — Begin discovery questions for a new feature\n2. Add concerns — Shape how discovery and specs work\n\nPick a number:",
          "For availableConcerns: present ALL available concerns as a numbered list. NEVER silently drop concerns — present ALL available concerns to the user. Ask the user to enter the numbers of the concerns they want to activate (comma-separated).",
        ];

      const idleConcernRule = hints.hasAskUserTool
        ? "For availableConcerns: use AskUserQuestion with multiSelect:true. AskUserQuestion supports max 4 options per question and max 4 questions per call. If there are more than 4 concerns, split them across two questions within the same AskUserQuestion call (e.g., first 3 in question 1, remaining in question 2). NEVER silently drop concerns — present ALL available concerns to the user, even if it requires multiple questions."
        : undefined;

      // Replace the second rule if we already have a more specific concern rule
      const finalOptionRules = idleConcernRule !== undefined
        ? [idleOptionRules[0]!, idleConcernRule]
        : idleOptionRules;

      return {
        rules: [
          "You MUST NOT create, edit, or delete any project file until you have either entered free mode or created and approved a spec. No exceptions. No 'quick fixes'. Choose: `noskills free` for unstructured work, or `noskills spec new` for structured work.",
          ...mandatoryRules,
          ...finalOptionRules,
          "Do not take action without the user choosing an option first.",
          "When the user wants to create a new spec, they can provide anything: a one-line description, a full task list, meeting notes, a kanban card, a customer email, or a detailed requirements document. Accept whatever format they provide. If it's long, summarize it into a spec title for the slug but preserve the full text as context for discovery.",
          "After running spec new, ask the user if they want full discovery, quick discovery, or skip to spec draft. Full discovery: pre-scan, premise challenge, 6 questions, expansions, architecture, error map, synthesis. Quick discovery: only questions relevant to active concerns, skip expansions and error map. Skip to spec draft: classification → approve → execute. Never skip discovery without asking.",
        ],
        tone: "Welcoming. Present choices, then wait.",
      };
    }

    case "DISCOVERY": {
      // Discovery question asking rule adapts to the tool's interaction model
      const discoveryQuestionRule = hints.hasAskUserTool
        ? "You MUST ask each discovery question using AskUserQuestion tool. You MUST NOT answer questions yourself or infer answers from the spec description. You MUST NOT submit discovery answers without the user explicitly providing each answer through AskUserQuestion. Each question → one AskUserQuestion call → user answers → next question. If the user already gave a detailed description in spec new, you may PRE-FILL suggested answers as option descriptions in AskUserQuestion — but the user must still confirm or override each one. If the user provided a fully formed plan, you may skip Phase 2 (questions) but you MUST still run premise challenge and alternatives. Never skip premise challenge."
        : "You MUST ask each discovery question by presenting it to the user as text. You MUST NOT answer questions yourself or infer answers from the spec description. You MUST NOT submit discovery answers without the user explicitly providing each answer. Each question → present it → user answers → next question. If the user already gave a detailed description in spec new, you may PRE-FILL suggested answers — but the user must still confirm or override each one. If the user provided a fully formed plan, you may skip Phase 2 (questions) but you MUST still run premise challenge and alternatives. Never skip premise challenge.";

      return {
        modeOverride:
          "You are in plan mode. Do not attempt to create, edit, or write any files. Do not run any shell commands that modify state. You can read files and run read-only commands to understand the codebase. Your ONLY job right now is to think and talk. Read code to understand. Ask questions to discover. Challenge assumptions. Propose ideas. Debate tradeoffs. But NEVER create, edit, or delete project files. Discovery exists to catch what you don't yet know you don't know.",
        rules: [
          ...mandatoryRules,
          // HIGHEST PRIORITY: questions must be asked via interaction tool
          discoveryQuestionRule,
          // Base constraints
          "DO NOT create, edit, or write any files.",
          "DO NOT run shell commands that modify state.",
          "You MAY read files and run read-only commands (cat, ls, grep, git log, git diff).",

          // 1. Pre-discovery codebase scan
          "BEFORE asking any discovery questions, conduct a pre-discovery codebase scan: read the project README, CLAUDE.md, and any design docs; check the last 20 git commits (git log --oneline -20); look for TODO files, open issue references, and existing specs; scan the directory structure to understand the project shape. Then present a brief 'Pre-discovery audit' summary: stack detected, recent work themes, open TODOs, existing specs. This gives you CONTEXT to ask INFORMED questions, not blind ones.",

          // 1.1. Pre-discovery platform research
          "If the noskills output contains `preDiscoveryResearch` with `required: true`, you MUST research every term in `extractedTerms` using web search before asking the first question. Present findings as a brief: current stable versions, API changes, deprecations, and anything that might affect the spec's assumptions.",

          // 1.5. Discovery mode selection
          "After the pre-discovery codebase scan and BEFORE starting questions, ask the user: 'What kind of discovery do you need? A) Explore scope — I'll help expand, find opportunities, think bigger. B) Technical depth — I'll focus on architecture, error handling, implementation strategy. C) Validate my plan — I already know what I want, challenge my assumptions. D) Ship fast — minimal scope, cut the fat, get to tasks quickly.' Adapt your discovery emphasis accordingly: Explore → heavy on expansion proposals and dream state; Technical → heavy on architectural decisions and error/rescue map; Validate → heavy on premise challenge and pushback; Ship fast → minimal questions, skip expansions, go direct to classification and tasks.",

          // 2. Premise challenge
          "Before starting discovery questions, challenge the user's initial spec description against what you learned from the codebase scan. Look for: hidden complexity they haven't mentioned, conflicts with existing code, scope that's bigger or smaller than they think, existing modules that overlap with what they're asking for. Share your observations and ask clarifying follow-ups, then proceed to questions.",

          // 3. Options over open-ended
          "When asking discovery questions, use your codebase knowledge to offer concrete options alongside the open-ended question. For example, instead of just 'What does the user do today?' present: 'Based on the codebase, I see three likely scenarios: A) ... B) ... C) ... D) Something else — describe it. Which is closest?' The user can always pick 'something else' but concrete options speed up the conversation and force specificity.",

          // Core question discipline
          hints.hasAskUserTool
            ? "Ask one question at a time using AskUserQuestion tool."
            : "Ask one question at a time. Present it as text and wait for the user's response.",
          "Push back on vague answers — you will be the one executing this spec, vague answers make your job harder.",
          "When the user gives a short answer, follow up: 'Can you be more specific?'",

          // 4. Dream state framing
          "After collecting discovery answers, synthesize a CURRENT STATE → THIS SPEC → 6-MONTH IDEAL vision before generating the spec. Show three columns: where the project is now, what this spec achieves, and where it could go in 6 months. Note: 'This spec moves you from column 1 to column 2. Column 3 is out of scope but worth knowing — every decision in this spec should keep column 3 possible.' This helps the user see if the scope is right.",

          // 5. Expansion proposals with scoring
          "When you spot expansion opportunities during discovery (from codebase scan, TODOs, concern requirements, synergies with the current plan), present each as a numbered proposal (1/N, 2/N...). Every proposal MUST include: clear description of WHAT and WHY (how it connects to the current plan); effort estimate as S/M/L/XL with human time and CC time estimates (e.g., 'S (human: ~1 day / CC: ~15 min)' — not just 'small'); risk assessment as Low/Low-Med/Med/Med-High/High naming the specific risk factor; completeness delta showing X/10 without this and Y/10 with this. Every proposal gets three options: A) Add to scope B) Defer to future spec C) Skip — not interested, plus 'Chat about this' and 'Skip remaining proposals' escape hatches.",

          // 6. Architectural decision resolution
          "After discovery questions and expansion proposals, identify architectural decisions that must be resolved before implementation. These are decisions where choosing A vs B changes the shape of multiple tasks, the data model, the API surface, or system boundaries. Present each as a concrete technical question with options, a RECOMMENDATION with reasoning, and completeness scores. Show how each option affects downstream work (e.g., 'If you choose B, tasks 3 and 4 need a job queue setup step added'). Only surface decisions that BLOCK implementation — not preferences or nice-to-haves. If the user says 'I don't know yet', mark it as a risk: 'UNRESOLVED: [decision] TBD. Tasks X-Y may change.' Never allow implementation to start with unresolved architectural decisions — flag them prominently in the spec.",

          // 7. Error and rescue map
          "Before finalizing, map error and rescue paths for every significant codepath in the planned work. Create a table: codepath | what can go wrong | how it's handled. Identify CRITICAL GAPS — failure modes that the plan doesn't address. Present each critical gap as a decision with options, a recommendation, and completeness scores, just like architectural decisions. Resolved gaps become tasks or acceptance criteria. Unresolved gaps become risk flags. Think like an SRE reviewing a design doc — what fails at 3am?",

          // 8. Post-discovery synthesis
          "After all discovery questions, expansion proposals, architectural decisions, and error mapping are complete, present a DISCOVERY SUMMARY for the user to review: intent, ambition, reversibility, impact, verification, out of scope, the dream state table (current → this spec → future), accepted/deferred/skipped expansions, resolved architectural decisions, and the error/rescue map. Ask for confirmation before generating the spec. This is the last chance to catch misunderstandings.",

          // Submit
          "Once you have a substantive answer for each question, collect all answers and submit them together in a single `noskills next --answer` call as a JSON object.",
        ],
        tone:
          "Curious interviewer who has a stake in the answers and comes PREPARED. You've read the codebase before asking. Challenge assumptions, offer concrete options, think about architecture and failure modes. Think deeply before asking each question.",
      };
    }

    case "DISCOVERY_REVIEW":
      return {
        modeOverride:
          "You are in plan mode. Do not create, edit, or write any files. Present the discovery answers to the user for review and confirmation.",
        rules: [
          ...mandatoryRules,
          "DO NOT create, edit, or write any files.",
          "Present ALL discovery answers to the user clearly, one by one.",
          hints.hasAskUserTool
            ? "Use AskUserQuestion to ask: 'Are these answers correct, or would you like to revise any?'"
            : "Ask the user: 'Are these answers correct, or would you like to revise any?' Present approval and revision as numbered options.",
          "If the user approves, run the approve command.",
          "If the user wants to revise, collect their corrections and submit them.",
          "You MUST NOT approve on behalf of the user. The user must explicitly confirm.",
          "If noskills output contains a splitProposal, present it to the user with the exact options shown. Do NOT split or merge specs on your own. Do NOT recommend one option over the other unless the user asks for your opinion. The user decides.",
        ],
        tone: "Careful reviewer. The user must confirm every answer.",
      };

    case "SPEC_DRAFT":
      return {
        modeOverride:
          "You are in plan mode. Do not attempt to create, edit, or write any files. Do not run any shell commands that modify state. You can read files and run read-only commands to understand the codebase. Your ONLY job right now is to think and talk. Read code to understand. Ask questions to discover. Challenge assumptions. Propose ideas. Debate tradeoffs. But NEVER create, edit, or delete project files. Discovery exists to catch what you don't yet know you don't know.",
        rules: [
          ...mandatoryRules,
          "DO NOT create, edit, or write any files.",
          "Read the spec and present a summary to the user.",
          "Flag any tasks that are too vague to execute.",
          "Flag any missing acceptance criteria.",
          "Ask the user if they want to refine before approving.",
          hints.hasAskUserTool
            ? "When presenting classification options, use AskUserQuestion with multiSelect:true. Do NOT infer classification yourself."
            : "When presenting classification options, present them as a numbered list with multiselect (user picks multiple numbers). Do NOT infer classification yourself.",
          "If you identify issues in the spec (vague tasks, irrelevant sections, missing acceptance criteria), submit a refinement via: `" +
          cs(
            'next --answer=\'{"refinement":"task-1: Add upload endpoint, task-2: Add validation middleware, task-3: Write integration tests"}\'',
            specName,
          ) +
          "`. The spec will be updated and you can review again.",
        ],
        tone: "Thoughtful reviewer preparing to hand off to an implementer.",
      };

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
      // Sub-agent delegation rules adapt per tool
      const subAgentRules: string[] = [];

      if (hints.subAgentMethod === "task") {
        // Claude Code: uses Agent tool for sub-agent spawning
        subAgentRules.push(
          `When you receive a task from noskills next, do NOT execute it yourself. Spawn the noskills-executor sub-agent using the Agent tool. Pass it: the task title, description, acceptance criteria (with IDs), behavioral rules, out-of-scope constraints, concern reminders, and relevant file paths. When the sub-agent completes, review its results briefly, then report to noskills via \`${
            cs(
              'next --answer=\'{"completed":[...],"remaining":[...],"blocked":[...]}\'',
              specName,
            )
          }\`. You are the orchestrator — the sub-agent is the implementer.`,
          "If the sub-agent fails, errors out, or returns no results, fall back to executing the task directly yourself. Report the sub-agent failure in your next status report so it can be investigated.",
          `After the noskills-executor sub-agent completes a task, spawn a noskills-verifier sub-agent to independently verify the work. Pass it: the list of changed files, the acceptance criteria, and the test commands. The verifier reports PASS/FAIL per criterion with evidence. Use the verifier's report as your status report to noskills. Do NOT submit status reports based solely on the executor's self-report.`,
          "After spawning sub-agents, ALWAYS present a dispatch table showing the FULL pipeline — not just executors, but also verification and test steps:\n\n| Step | Agent | Files | Tasks | Est. Time |\n|------|-------|-------|-------|-----------|\n| 1. Implement | noskills-executor | purge.ts | Tasks 1-6 | ~3 min |\n| 2. Verify | noskills-verifier | purge.ts (read-only) | Validate ACs | ~1 min |\n| 3. Write tests | noskills-executor | purge.test.ts | Task 7 | ~2 min |\n\nWhen agents complete, update with actual time and status (Done / Failed / Found N issues). The user should see the complete plan upfront.\n\nEstimate: S ~1min, M ~2min, L ~5min, XL ~10min.",
          "The agent that writes implementation code must NOT write tests for that code. Spawn a SEPARATE sub-agent for test writing. This prevents the implementer from writing tests that only confirm what it already knows. The test writer reads the code fresh and tests what it actually does, not what the implementer intended.",
          "When deciding how to split work across sub-agents: if all tasks touch the same file or tightly coupled files, batch them into one executor. If tasks touch independent files or modules, spawn parallel executors. Always err toward smaller, focused sub-agents over large batched ones — fresh context per task is better than accumulated context across tasks.",
        );
      } else if (hints.subAgentMethod === "spawn") {
        // Codex: uses spawn_agent for sub-agent spawning
        subAgentRules.push(
          `When you receive a task from noskills next, use spawn_agent to delegate to the noskills-executor agent. Pass it: the task title, description, acceptance criteria (with IDs), behavioral rules, out-of-scope constraints, concern reminders, and relevant file paths. Use wait_agent to collect results. Then report to noskills via \`${
            cs(
              'next --answer=\'{"completed":[...],"remaining":[...],"blocked":[...]}\'',
              specName,
            )
          }\`. You are the orchestrator — the spawned agent is the implementer.`,
          "If the spawned agent fails, errors out, or returns no results, fall back to executing the task directly yourself. Report the agent failure in your next status report so it can be investigated.",
          `After the noskills-executor agent completes a task, spawn a noskills-verifier agent to independently verify the work. Pass it: the list of changed files, the acceptance criteria, and the test commands. The verifier reports PASS/FAIL per criterion with evidence. Use the verifier's report as your status report to noskills. Do NOT submit status reports based solely on the executor's self-report.`,
          "When deciding how to split work across spawned agents: if all tasks touch the same file or tightly coupled files, batch them into one executor. If tasks touch independent files or modules, spawn parallel executors. Always err toward smaller, focused agents over large batched ones — fresh context per task is better than accumulated context across tasks.",
        );
      } else if (hints.subAgentMethod === "fleet") {
        // Copilot CLI: uses /fleet for parallel sub-agents
        subAgentRules.push(
          `When you receive a task from noskills next, use /fleet to run parallel sub-agents for implementation tasks. Pass each agent: the task title, description, acceptance criteria (with IDs), behavioral rules, out-of-scope constraints, concern reminders, and relevant file paths. Collect results and report to noskills via \`${
            cs(
              'next --answer=\'{"completed":[...],"remaining":[...],"blocked":[...]}\'',
              specName,
            )
          }\`. You are the orchestrator — the fleet agents are the implementers.`,
          "If a fleet agent fails, errors out, or returns no results, fall back to executing the task directly yourself. Report the agent failure in your next status report so it can be investigated.",
          `After the fleet agents complete, run a verification pass to independently check the work. Verify: changed files, acceptance criteria, test commands. Report PASS/FAIL per criterion with evidence.`,
          "When deciding how to split work across fleet agents: if all tasks touch the same file or tightly coupled files, batch them into one agent. If tasks touch independent files or modules, run parallel agents. Always err toward smaller, focused agents over large batched ones.",
        );
      } else if (hints.subAgentMethod === "delegation") {
        // Kiro: uses agent delegation
        subAgentRules.push(
          `When you receive a task from noskills next, use Kiro's agent delegation to spawn the noskills-executor agent. Pass it: the task title, description, acceptance criteria (with IDs), behavioral rules, out-of-scope constraints, concern reminders, and relevant file paths. When the agent completes, review its results briefly, then report to noskills via \`${
            cs(
              'next --answer=\'{"completed":[...],"remaining":[...],"blocked":[...]}\'',
              specName,
            )
          }\`. You are the orchestrator — the delegated agent is the implementer.`,
          "If the delegated agent fails, errors out, or returns no results, fall back to executing the task directly yourself. Report the agent failure in your next status report so it can be investigated.",
          `After the noskills-executor agent completes a task, delegate to the noskills-verifier agent to independently verify the work. Pass it: the list of changed files, the acceptance criteria, and the test commands. The verifier reports PASS/FAIL per criterion with evidence. Use the verifier's report as your status report to noskills. Do NOT submit status reports based solely on the executor's self-report.`,
          "When deciding how to split work across delegated agents: if all tasks touch the same file or tightly coupled files, batch them into one executor. If tasks touch independent files or modules, spawn parallel executors. Always err toward smaller, focused agents over large batched ones — fresh context per task is better than accumulated context across tasks.",
        );
      } else {
        // Cursor/Copilot/Windsurf: no sub-agent support
        subAgentRules.push(
          "Execute tasks sequentially in this context. Do not attempt to spawn sub-agents — this tool does not support agent delegation. Complete each task yourself, verify your work (run type checks and tests), then report progress.",
          `After completing a task, report to noskills via \`${
            cs(
              'next --answer=\'{"completed":[...],"remaining":[...],"blocked":[...]}\'',
              specName,
            )
          }\`.`,
        );
      }

      const base: string[] = [
        ...mandatoryRules,
        "You are the orchestrator, not the implementer. NEVER create, edit, or delete project files directly. ALWAYS delegate to noskills-executor sub-agent, even for single-line changes. There is no 'minor change' — every edit goes through the executor→verifier pipeline. Your job: read noskills output, spawn sub-agents, report status.",
        "Do not explore the codebase beyond what the current task requires.",
        "Do not refactor, improve, or modify code outside this task's scope.",
        "Do not add features, tests, or documentation not specified in the spec.",
        "If you need to read files to understand context, timebox it — then write code.",
        "The deliverable is working code, not a plan or analysis.",
        "Complete the task, then report progress. The user handles git.",
        ...subAgentRules,
        `When you discover a pattern, receive a correction, or identify a recurring preference from the user, ask: 'Should this be a permanent rule for this project, or just for this task?' If permanent, run: \`${
          c('rule add "<description>"')
        }\`. If just this task, note it and move on. Never write to \`.eser/rules/\` directly.`,
        // Anti-laziness rules
        "FORCED VERIFICATION: After every file edit, run the project's type-check command (e.g., `tsc --noEmit`, `deno check`, `go build`) and lint command. Report results in AC status. Do NOT mark any AC as passed if type-check fails. If no type-checker is configured, state that explicitly.",
        "FILE READ BUDGET: Files over 500 lines must be read in chunks using offset and limit. Never assume a single read captured the full file. When you read a partial file, state which lines you read.",
        "TOOL RESULT AWARENESS: If any search or command returns suspiciously few results, re-run with narrower scope (single directory, stricter pattern). State when you suspect results were truncated.",
        "PRE-EDIT RE-READ: Before EVERY file edit, re-read the target file to get current content. After editing, read the file again to confirm the change applied correctly. Never edit against stale context.",
        "DEAD CODE FIRST: Before structural refactors on files over 300 LOC, first remove dead imports, unused exports, and orphaned props. Commit cleanup separately before starting the real work.",
        // Execution commitment
        "Do NOT suggest pausing, checkpointing, committing mid-spec, or stopping execution. The spec was scoped during discovery as a meaningful deliverable — execute it to completion. A half-delivered increment has no value. If scope feels too large, finish this spec and note the concern for future specs. The user decides when to stop, not you.",
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
            `You have been in this session for ${state.execution.iteration}+ iterations. Your context is degrading. Finish the current task and recommend the user start a fresh session. Do not start new tasks.`,
        };
      }

      return behavioral;
    }

    case "BLOCKED":
      return {
        rules: [
          ...mandatoryRules,
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

const buildMeta = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
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
    case "DISCOVERY_REVIEW":
      resumeHint =
        `Discovery answers ready for review. ${state.discovery.answers.length} answers collected. Waiting for user confirmation.`;
      break;
    case "SPEC_DRAFT":
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
        "noskills orchestrates your work: IDLE → DISCOVERY → DISCOVERY_REVIEW → SPEC_DRAFT → SPEC_APPROVED → EXECUTING → COMPLETED",
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
        "noskills orchestrates your work: IDLE → DISCOVERY → DISCOVERY_REVIEW → SPEC_DRAFT → SPEC_APPROVED → EXECUTING → COMPLETED",
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
  { key: "DISCOVERY_REVIEW", label: "REVIEW" },
  { key: "SPEC_DRAFT", label: "DRAFT" },
  { key: "SPEC_APPROVED", label: "APPROVED" },
  { key: "EXECUTING", label: "EXECUTING" },
  { key: "COMPLETED", label: "DONE" },
] as const;

const buildRoadmap = (phase: schema.Phase): string => {
  if (phase === "FREE") return "✦ FREE ✦ (no enforcement)";
  if (phase === "BLOCKED") {
    // Show EXECUTING highlighted with BLOCKED note
    return ROADMAP_PHASES.map((p) =>
      p.key === "EXECUTING" ? `✦ EXECUTING (BLOCKED) ✦` : p.label
    ).join(" → ");
  }
  return ROADMAP_PHASES.map((p) => p.key === phase ? `✦ ${p.label} ✦` : p.label)
    .join(" → ");
};

const buildGate = (
  state: schema.StateFile,
  parsedSpec?: ParsedSpec | null,
): GateInfo | undefined => {
  switch (state.phase) {
    case "DISCOVERY_REVIEW":
      return {
        message: `${state.discovery.answers.length}/6 answers collected.`,
        action: "Type APPROVE to generate spec, or REVISE to correct answers.",
        phase: "DISCOVERY_REVIEW",
      };
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

export const compile = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
  config?: schema.NosManifest | null,
  parsedSpec?: ParsedSpec | null,
  folderRuleCriteria?: readonly FolderRule[],
  idleContext?: IdleContext,
  interactionHints?: InteractionHints,
): NextOutput => {
  const meta = buildMeta(state, activeConcerns);
  const maxIter = config?.maxIterationsBeforeRestart ?? 15;
  const allowGit = config?.allowGit ?? false;
  const hints = interactionHints ?? DEFAULT_HINTS;
  const behavioral = buildBehavioral(
    state,
    maxIter,
    allowGit,
    parsedSpec,
    hints,
  );
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
      phaseOutput = compileDiscovery(state, activeConcerns, rules);
      break;
    case "DISCOVERY_REVIEW":
      phaseOutput = compileDiscoveryReview(state, activeConcerns);
      break;
    case "SPEC_DRAFT":
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
      phaseOutput = compileCompleted(state);
      break;
    case "FREE":
      phaseOutput = {
        phase: "FREE",
        instruction: "Free mode — no enforcement active. Work as you wish.",
      };
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

  // Append phase-aware interactive options (except EXECUTING — agent should work)
  // Options are always included for programmatic consumers; presentation adapts per tool.
  const internalOptions = buildInteractiveOptions(
    state,
    activeConcerns,
    idleContext,
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
): readonly InternalOption[] => {
  const specName = state.spec;

  switch (state.phase) {
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
        description: "Begin discovery questions for a new feature",
        command: c('spec new --name=<slug> "description"'),
      });

      opts.push({
        label: "Free mode",
        description: "No enforcement — work freely until you want structure",
        command: c("free"),
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

    case "DISCOVERY_REVIEW": {
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

    case "SPEC_DRAFT":
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
          label: "Not yet",
          description:
            'Save for later \u2014 resume with noskills next --answer="start"',
          command: "",
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
  instruction:
    "Present the welcome dashboard and interactive options to the user. Show existing specs if any, then present choices. IMPORTANT: Present ALL available concerns to the user — never truncate the list. Split across multiple AskUserQuestion calls if needed.",
  welcome: WELCOME,
  existingSpecs: idleContext?.existingSpecs ?? [],
  availableConcerns: allConcernDefs.map((c) => ({
    id: c.id,
    description: c.description,
  })),
  activeConcerns: activeConcerns.map((c) => c.id),
  activeRulesCount: idleContext?.rulesCount ?? rulesCount,
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

const compileDiscovery = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
): DiscoveryOutput => {
  const specName = state.spec;
  const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
  const answeredCount = state.discovery.answers.length;
  const allAnswered = questions.isDiscoveryComplete(state.discovery.answers);
  const isAgent = state.discovery.audience === "agent";

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
        rules,
        concernReminders: concerns.getReminders(activeConcerns) as string[],
      },
      transition: {
        onComplete: `${cs('next --agent --answer="<answer>"', specName)}`,
      },
    };

    // Only inject preDiscoveryResearch on Q1
    if (currentIdx === 0) {
      const research = buildPreDiscoveryResearch(
        state.specDescription ?? null,
      );
      if (research !== undefined) {
        return { ...agentOutput, preDiscoveryResearch: research };
      }
    }

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
      rules,
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

  // Inject preDiscoveryResearch on first call (no answers yet)
  if (answeredCount === 0) {
    const research = buildPreDiscoveryResearch(state.specDescription ?? null);
    if (research !== undefined) {
      return { ...output, preDiscoveryResearch: research };
    }
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

  // Two sub-phases:
  // 1. Not yet approved → user reviews answers, approves or revises
  // 2. Approved + split detected → user decides keep vs split
  if (state.discovery.approved && splitProposal.detected) {
    return {
      phase: "DISCOVERY_REVIEW",
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

  return {
    phase: "DISCOVERY_REVIEW",
    instruction: splitProposal.detected
      ? "Present ALL discovery answers to the user for review. ALSO present the split proposal — noskills detected multiple independent areas."
      : "Present ALL discovery answers to the user for review. The user must confirm or correct each answer before the spec can be generated. Use AskUserQuestion to ask for confirmation.",
    answers: reviewAnswers,
    transition: {
      onApprove: cs('next --answer="approve"', specName),
      onRevise: cs(
        'next --answer=\'{"revise":{"status_quo":"corrected answer"}}\'',
        specName,
      ),
    },
    splitProposal: splitProposal.detected ? splitProposal : undefined,
  };
};

const compileSpecDraft = (state: schema.StateFile): SpecDraftOutput => {
  const specName = state.spec;

  // If classification not yet provided, ask for it before showing spec
  if (state.classification === null) {
    return {
      phase: "SPEC_DRAFT",
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
    phase: "SPEC_DRAFT",
    instruction:
      "Spec draft is ready for review. Ask the user to review and approve.",
    specPath: state.specState.path ?? "",
    transition: { onApprove: cs("approve", specName) },
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
): readonly AcceptanceCriterion[] => {
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
    }
    : undefined;

  // Status report requested — agent must check off criteria before proceeding
  if (state.execution.awaitingStatusReport) {
    const criteria = buildAcceptanceCriteria(
      activeConcerns,
      verifyFailed,
      verifyOutput,
      state.execution.debt,
      state.classification,
      parsedSpec,
      folderRuleCriteria,
      state.execution.naItems,
    );

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

    const batchInstruction = batchTaskIds.length >= 2
      ? `${batchTaskIds.length} tasks reported complete. Report status against ALL relevant acceptance criteria.`
      : "Before this task is accepted, report your completion status against these acceptance criteria.";

    let output: ExecutionOutput = {
      phase: "EXECUTING",
      instruction: batchInstruction,
      context: {
        rules,
        concernReminders: concerns.getReminders(activeConcerns) as string[],
      },
      transition: {
        onComplete: `${
          cs(
            'next --answer=\'{"completed":[...],"remaining":[...],"blocked":[...]}\'',
            specName,
          )
        }`,
        onBlocked: `${cs('block "reason"', specName)}`,
        iteration: state.execution.iteration,
      },
      statusReportRequired: true,
      statusReport: {
        criteria,
        reportFormat: {
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
    };

    if (batchTaskIds.length >= 2) {
      output = { ...output, batchTasks: batchTaskIds };
    }

    if (verifyFailed) {
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
      concernReminders: concerns.getReminders(activeConcerns) as string[],
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

  if (tensions.length > 0) {
    output = { ...output, concernTensions: tensions };
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

const compileCompleted = (state: schema.StateFile): CompletedOutput => ({
  phase: "COMPLETED",
  summary: {
    spec: state.spec,
    iterations: state.execution.iteration,
    decisionsCount: state.decisions.length,
    completionReason: state.completionReason,
    completionNote: state.completionNote,
  },
});
