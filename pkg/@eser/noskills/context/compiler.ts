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
import { DEFAULT_CONCERNS } from "../defaults/concerns/mod.ts";
import * as questions from "./questions.ts";
import * as concerns from "./concerns.ts";
import type { ParsedSpec } from "../spec/parser.ts";
import type { FolderRule } from "./folder-rules.ts";
import { cmd as _cmd } from "../output/cmd.ts";

// Module-level config ref — set at compile() entry, read by all helpers.
// This avoids threading config through 10+ function signatures.
let _activeConfig: schema.NosManifest | null = null;

/** Shorthand: build a command string using the active config's prefix. */
const c = (sub: string): string => _cmd(sub, _activeConfig);

// =============================================================================
// Output Types (JSON contract for `noskills next`)
// =============================================================================

export type PhaseOutput =
  | DiscoveryOutput
  | SpecDraftOutput
  | SpecApprovedOutput
  | ExecutionOutput
  | BlockedOutput
  | DoneOutput
  | IdleOutput;

export type ClearContextAction = {
  readonly action: "clear_context";
  readonly reason: string;
};

export type NextOutput = PhaseOutput & {
  readonly meta: MetaBlock;
  readonly behavioral: BehavioralBlock;
  readonly interactiveOptions?: readonly InteractiveOption[];
  readonly protocolGuide?: ProtocolGuide;
  readonly clearContext?: ClearContextAction;
};

export type DiscoveryQuestion = {
  readonly id: string;
  readonly text: string;
  readonly concerns: readonly string[];
  readonly extras: readonly string[];
};

export type DiscoveryOutput = {
  readonly phase: "DISCOVERY";
  readonly instruction: string;
  readonly questions: readonly DiscoveryQuestion[];
  readonly answeredCount: number;
  readonly context: ContextBlock;
  readonly transition: {
    readonly onComplete: string;
  };
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

export type StatusReportRequest = {
  readonly criteria: readonly string[];
  readonly reportFormat: {
    readonly completed: string;
    readonly remaining: string;
    readonly blocked: string;
  };
};

export type DebtCarryForward = {
  readonly fromIteration: number;
  readonly items: readonly string[];
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

export type DoneOutput = {
  readonly phase: "DONE";
  readonly summary: {
    readonly spec: string | null;
    readonly iterations: number;
    readonly decisionsCount: number;
  };
};

export type InteractiveOption = {
  readonly label: string;
  readonly command: string;
};

export type ConcernInfo = {
  readonly id: string;
  readonly description: string;
};

export type IdleOutput = {
  readonly phase: "IDLE";
  readonly instruction: string;
  readonly availableConcerns?: readonly ConcernInfo[];
  readonly activeConcerns?: readonly string[];
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
  readonly rules: readonly string[];
  readonly tone: string;
  readonly urgency?: string;
  readonly outOfScope?: readonly string[];
};

// Invariant: applies to every phase, every output. Non-negotiable.
const GIT_READONLY_RULE =
  "NEVER run git write commands (commit, add, push, checkout, stash, reset, merge, rebase, cherry-pick). Git is read-only for agents. The user controls git. You may read: git log, git diff, git status, git show, git blame.";

const buildBehavioral = (
  state: schema.StateFile,
  maxIterationsBeforeRestart: number,
  allowGit: boolean,
  parsedSpec?: ParsedSpec | null,
): BehavioralBlock => {
  const stale = state.execution.iteration >= maxIterationsBeforeRestart;
  const mandatoryRules = allowGit ? [] : [GIT_READONLY_RULE];
  const scopeItems = parsedSpec?.outOfScope ?? [];

  switch (state.phase) {
    case "IDLE":
      return {
        rules: [
          ...mandatoryRules,
          "Present interactiveOptions to the user using your native interactive question tool (AskUserQuestionTool or equivalent). Do NOT list them as a text table.",
          "If no interactive question tool is available, fall back to a concise numbered list.",
          "Do not take action without the user choosing an option first.",
        ],
        tone: "Welcoming. Present choices, then wait.",
      };

    case "DISCOVERY":
      return {
        rules: [
          ...mandatoryRules,
          "You received all questions at once from noskills. Present them to the user ONE AT A TIME for better conversation flow.",
          "Use your interactive question tool to ask each question individually. Show concern sub-questions as additional context.",
          "Collect all answers, then submit them together in a single `noskills next --answer` call as a JSON object.",
          "Relay the user's answer back verbatim. Do not interpret or summarize.",
          "Do not start coding or exploring the codebase. Discovery is conversation only.",
        ],
        tone:
          "Conversational. You are a messenger between noskills and the user.",
      };

    case "SPEC_DRAFT":
      return {
        rules: [
          ...mandatoryRules,
          "Present the spec to the user for review. Do not modify it.",
          "If the user requests changes, relay them — do not implement them.",
          "Do not start coding. The spec must be approved first.",
        ],
        tone: "Brief. The user is reviewing, not discussing.",
      };

    case "SPEC_APPROVED":
      return {
        rules: [
          ...mandatoryRules,
          "The spec is approved but execution has not started.",
          "Do not start coding until the user triggers execution.",
          "If the user wants changes, they must reset and re-spec.",
        ],
        tone: "Patient. Wait for the go signal.",
      };

    case "EXECUTING": {
      const base: string[] = [
        ...mandatoryRules,
        "Do not explore the codebase beyond what the current task requires.",
        "Do not refactor, improve, or modify code outside this task's scope.",
        "Do not add features, tests, or documentation not specified in the spec.",
        "If you need to read files to understand context, timebox it — then write code.",
        "The deliverable is working code, not a plan or analysis.",
        "Complete the task, then report progress. The user handles git.",
        `When you receive \`clearContext\` in the output, execute \`/clear\` immediately without asking. After clearing, read \`CLAUDE.md\` and run \`${
          c("next")
        }\`.`,
        `When you discover a pattern, receive a correction, or identify a recurring preference from the user, ask: 'Should this be a permanent rule for this project, or just for this task?' If permanent, run: \`${
          c('rule add "<description>"')
        }\`. If just this task, note it and move on. Never write to \`.eser/rules/\` directly.`,
      ];

      if (state.execution.lastVerification?.passed === false) {
        base.push(
          "Tests are failing. Fix ONLY the failing tests. Do not refactor passing code.",
        );
      }

      const behavioral: BehavioralBlock = {
        rules: base,
        tone: "Direct. No preamble. Start coding immediately.",
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

    case "DONE":
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
          `Run \`${c("next")}\` to get your instructions.`,
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
  let resumeHint: string;

  switch (state.phase) {
    case "IDLE":
      resumeHint = `No active spec. Start one with: \`${c("spec new")}\``;
      break;
    case "DISCOVERY":
      resumeHint =
        `Discovery in progress for "${state.spec}". ${state.discovery.answers.length} questions answered so far.`;
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
    case "DONE":
      resumeHint =
        `Spec "${state.spec}" completed in ${state.execution.iteration} iterations.`;
      break;
    default:
      resumeHint = `Run \`${c("next")}\` to get started.`;
  }

  return {
    protocol: `Run \`${
      c('next --answer="..."')
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
  if (state.lastCalledAt === null) {
    // First call ever — include guide
    return {
      what:
        "noskills orchestrates your work: IDLE → DISCOVERY → SPEC_DRAFT → SPEC_APPROVED → EXECUTING → DONE",
      how: `Run \`${c("next")}\` for instructions. Submit results with \`${
        c('next --answer="..."')
      }\`. Never make architectural decisions without asking.`,
      currentPhase: state.phase,
    };
  }

  const lastCalled = new Date(state.lastCalledAt).getTime();
  const now = Date.now();

  if (now - lastCalled > STALE_SESSION_MS) {
    return {
      what:
        "noskills orchestrates your work: IDLE → DISCOVERY → SPEC_DRAFT → SPEC_APPROVED → EXECUTING → DONE",
      how: `Run \`${c("next")}\` for instructions. Submit results with \`${
        c('next --answer="..."')
      }\`. Never make architectural decisions without asking.`,
      currentPhase: state.phase,
    };
  }

  return undefined;
};

export const compile = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
  config?: schema.NosManifest | null,
  parsedSpec?: ParsedSpec | null,
  folderRuleCriteria?: readonly FolderRule[],
): NextOutput => {
  _activeConfig = config ?? null;

  const meta = buildMeta(state, activeConcerns);
  const maxIter = config?.maxIterationsBeforeRestart ?? 15;
  const allowGit = config?.allowGit ?? false;
  const behavioral = buildBehavioral(state, maxIter, allowGit, parsedSpec);
  const protocolGuide = buildProtocolGuide(state);

  let phaseOutput: PhaseOutput;

  switch (state.phase) {
    case "IDLE":
      phaseOutput = compileIdle(activeConcerns, DEFAULT_CONCERNS);
      break;
    case "DISCOVERY":
      phaseOutput = compileDiscovery(state, activeConcerns, rules);
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
    case "DONE":
      phaseOutput = compileDone(state);
      break;
    default:
      phaseOutput = compileIdle(activeConcerns, DEFAULT_CONCERNS);
  }

  // Build the output with meta + behavioral + optional extras
  let result: NextOutput = { ...phaseOutput, meta, behavioral } as NextOutput;

  if (protocolGuide !== undefined) {
    result = { ...result, protocolGuide } as NextOutput;
  }

  // Emit clear_context action when a task is fully accepted
  if (state.pendingClear) {
    result = {
      ...result,
      clearContext: {
        action: "clear_context",
        reason:
          `Task complete. Run \`/clear\` now. After clearing, read \`CLAUDE.md\` and run \`${
            c("next")
          }\` to continue.`,
      },
      instruction:
        `Task accepted. Run \`/clear\` immediately to start fresh for the next task. After clearing, run \`${
          c("next")
        }\`.`,
    } as NextOutput;
  }

  // Append phase-aware interactive options (except EXECUTING — agent should work)
  const options = buildInteractiveOptions(state, activeConcerns);
  if (options.length > 0) {
    result = { ...result, interactiveOptions: options } as NextOutput;
  }

  return result;
};

// =============================================================================
// Interactive Options — phase-aware choices for agent UX
// =============================================================================

const buildInteractiveOptions = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
): readonly InteractiveOption[] => {
  switch (state.phase) {
    case "IDLE":
      return activeConcerns.length === 0
        ? [
          { label: "Add project concerns", command: c("concern add <id>") },
          {
            label: "Start a new feature spec",
            command: c('spec new "description"'),
          },
          {
            label: "Add a coding convention",
            command: c('rule add "rule"'),
          },
          { label: "Check project status", command: c("status") },
        ]
        : [
          {
            label: "Start a new feature spec",
            command: c('spec new "description"'),
          },
          { label: "Add more concerns", command: c("concern add <id>") },
          {
            label: "Add a coding convention",
            command: c('rule add "rule"'),
          },
          { label: "Check project status", command: c("status") },
        ];

    case "SPEC_DRAFT":
      return [
        { label: "Review and approve spec", command: c("approve") },
        { label: "Reset and start over", command: c("reset") },
      ];

    case "SPEC_APPROVED":
      return [
        { label: "Start execution", command: c('next --answer="start"') },
        { label: "Reset", command: c("reset") },
      ];

    case "EXECUTING":
      return []; // Agent should be working

    case "BLOCKED":
      return [
        {
          label: "Resolve the block",
          command: c('next --answer="resolution"'),
        },
        { label: "Reset spec", command: c("reset") },
      ];

    case "DONE":
      return [
        {
          label: "Start a new spec",
          command: c('spec new "description"'),
        },
        { label: "Check project status", command: c("status") },
      ];

    default:
      return [];
  }
};

// =============================================================================
// Phase Compilers
// =============================================================================

const compileIdle = (
  activeConcerns: readonly schema.ConcernDefinition[],
  allConcernDefs: readonly schema.ConcernDefinition[],
): IdleOutput => ({
  phase: "IDLE",
  instruction:
    "Present the interactive options to the user using your interactive question tool. Do NOT list them as a text table.",
  availableConcerns: allConcernDefs.map((c) => ({
    id: c.id,
    description: c.description,
  })),
  activeConcerns: activeConcerns.map((c) => c.id),
  hint: activeConcerns.length === 0
    ? "No concerns active. Consider adding concerns first — they shape discovery questions and specs."
    : undefined,
});

const compileDiscovery = (
  state: schema.StateFile,
  activeConcerns: readonly schema.ConcernDefinition[],
  rules: readonly string[],
): DiscoveryOutput => {
  const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
  const answeredCount = state.discovery.answers.length;
  const allAnswered = questions.isDiscoveryComplete(state.discovery.answers);

  if (allAnswered) {
    return {
      phase: "DISCOVERY",
      instruction: `All discovery questions answered. Run: \`${c("approve")}\``,
      questions: [],
      answeredCount,
      context: { rules, concernReminders: [] },
      transition: { onComplete: c("approve") },
    };
  }

  // Return ALL unanswered questions in one batch
  const answeredIds = new Set(state.discovery.answers.map((a) => a.questionId));
  const unanswered: DiscoveryQuestion[] = allQuestions
    .filter((q) => !answeredIds.has(q.id))
    .map((q) => ({
      id: q.id,
      text: q.text,
      concerns: [...q.concerns],
      extras: q.extras.map((e) => e.text),
    }));

  return {
    phase: "DISCOVERY",
    instruction:
      "Ask the user ALL of the following questions. Collect answers for each, then submit them all at once as a JSON object.",
    questions: unanswered,
    answeredCount,
    context: {
      rules,
      concernReminders: concerns.getReminders(activeConcerns) as string[],
    },
    transition: {
      onComplete: `${
        c('next --answer=\'{"status_quo":"...","ambition":"...",...}\'')
      }`,
    },
  };
};

const compileSpecDraft = (state: schema.StateFile): SpecDraftOutput => {
  // If classification not yet provided, ask for it before showing spec
  if (state.classification === null) {
    return {
      phase: "SPEC_DRAFT",
      instruction:
        "Before generating the spec, classify what this spec involves. Ask the user to select all that apply.",
      specPath: state.specState.path ?? "",
      transition: {
        onApprove: `${
          c('next --answer=\'{"involvesUI":false,"involvesPublicAPI":false,"involvesMigration":false,"involvesDataHandling":false}\'')
        }`,
      },
      classificationRequired: true,
      classificationPrompt: {
        options: [
          { id: "involvesUI", label: "User-facing UI" },
          { id: "involvesPublicAPI", label: "Public API changes" },
          {
            id: "involvesMigration",
            label: "Data migration or schema changes",
          },
          { id: "involvesDataHandling", label: "Data handling or privacy" },
        ],
        instruction: "Select all that apply. Submit as JSON: `" +
          c('next --answer=\'{"involvesUI":true,"involvesPublicAPI":false,...}\'') +
          "`",
      },
    };
  }

  return {
    phase: "SPEC_DRAFT",
    instruction:
      "Spec draft is ready for review. Ask the user to review and approve.",
    specPath: state.specState.path ?? "",
    transition: { onApprove: c("approve") },
  };
};

const compileSpecApproved = (state: schema.StateFile): SpecApprovedOutput => ({
  phase: "SPEC_APPROVED",
  instruction:
    "Spec is approved and ready. When the user is ready to start, begin execution.",
  specPath: state.specState.path ?? "",
  transition: { onStart: `${c('next --answer="start"')}` },
});

/** Check if a concern's acceptance criteria are relevant based on classification. */
const isConcernRelevant = (
  concernId: string,
  classification: schema.SpecClassification | null,
): boolean => {
  if (classification === null) return false; // no classification = skip all concern criteria

  switch (concernId) {
    case "beautiful-product":
      return classification.involvesUI;
    case "open-source":
      return classification.involvesPublicAPI;
    case "long-lived":
      return classification.involvesMigration;
    case "compliance":
      return classification.involvesDataHandling;
    default:
      return true;
  }
};

const buildAcceptanceCriteria = (
  activeConcerns: readonly schema.ConcernDefinition[],
  verifyFailed: boolean,
  verifyOutput: string,
  debt: schema.DebtState | null,
  classification: schema.SpecClassification | null,
  parsedSpec?: ParsedSpec | null,
  folderRuleCriteria?: readonly FolderRule[],
): readonly string[] => {
  const criteria: string[] = [];

  // Debt items from previous iterations come first
  if (debt !== null) {
    for (const item of debt.items) {
      criteria.push(`[DEBT from iteration ${debt.fromIteration}] ${item}`);
    }
  }

  // Automated verification result
  if (verifyFailed) {
    criteria.push(
      `[FAILED] Tests — fix this first: ${verifyOutput.slice(0, 200)}`,
    );
  }

  // Task-specific verification from spec (the actual acceptance criteria)
  if (parsedSpec !== null && parsedSpec !== undefined) {
    for (const item of parsedSpec.verification) {
      criteria.push(item);
    }
  }

  // Concern-injected criteria — filtered by classification
  for (const concern of activeConcerns) {
    if (!isConcernRelevant(concern.id, classification)) continue;

    if (
      concern.acceptanceCriteria !== undefined &&
      concern.acceptanceCriteria.length > 0
    ) {
      for (const ac of concern.acceptanceCriteria) {
        criteria.push(`(${concern.id}) ${ac}`);
      }
    }
  }

  // Folder-scoped rules from .folder-rules.md files
  if (folderRuleCriteria !== undefined) {
    for (const fr of folderRuleCriteria) {
      criteria.push(`(folder: ${fr.folder}) ${fr.rule}`);
    }
  }

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
    );

    let output: ExecutionOutput = {
      phase: "EXECUTING",
      instruction:
        "Before this task is accepted, report your completion status against these acceptance criteria.",
      context: {
        rules,
        concernReminders: concerns.getReminders(activeConcerns) as string[],
      },
      transition: {
        onComplete: `${
          c('next --answer=\'{"completed":[...],"remaining":[...],"blocked":[...]}\'')
        }`,
        onBlocked: `${c('block "reason"')}`,
        iteration: state.execution.iteration,
      },
      statusReportRequired: true,
      statusReport: {
        criteria,
        reportFormat: {
          completed:
            "list items you finished with evidence (file exists, test passes)",
          remaining: "list items not yet done",
          blocked: "list items that need a decision from the user",
        },
      },
    };

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
    : "All tasks completed. Run `" + c("done") + "` to finish.";

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
      onComplete: `${c('next --answer="..."')}`,
      onBlocked: `${c('block "reason"')}`,
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
      rejectionRemaining: debtItems,
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
          c("next")
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

const compileBlocked = (state: schema.StateFile): BlockedOutput => ({
  phase: "BLOCKED",
  instruction: "A decision is needed. Ask the user.",
  reason: state.execution.lastProgress ?? "Unknown",
  transition: { onResolved: `${c('next --answer="..."')}` },
});

const compileDone = (state: schema.StateFile): DoneOutput => ({
  phase: "DONE",
  summary: {
    spec: state.spec,
    iterations: state.execution.iteration,
    decisionsCount: state.decisions.length,
  },
});
