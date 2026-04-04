// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills next` — Get next instruction for agent (JSON to stdout).
 * `noskills next --answer="..."` — Submit answer and advance state.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as compiler from "../context/compiler.ts";
import * as questions from "../context/questions.ts";
import * as specGenerator from "../spec/generator.ts";
import * as syncEngine from "../sync/engine.ts";
import * as specParser from "../spec/parser.ts";
import * as specUpdater from "../spec/updater.ts";
import * as folderRules from "../context/folder-rules.ts";
import * as splitDetector from "../context/split-detector.ts";
import * as formatter from "../output/formatter.ts";
import * as mode from "../output/mode.ts";
import * as identity from "../state/identity.ts";
import { cmd } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { root } = await persistence.resolveProjectRoot();
  const fmt = formatter.parseOutputFormat(args);
  const cleanArgs = formatter.stripOutputFlag(args);

  if (!(await persistence.isInitialized(root))) {
    await formatter.writeFormatted(
      { error: `noskills not initialized. Run: ${cmd("init")}` },
      fmt,
    );

    return results.fail({ exitCode: 1 });
  }

  // Parse --answer flag
  let answerText: string | null = null;

  for (const arg of cleanArgs) {
    if (arg.startsWith("--answer=")) {
      answerText = arg.slice("--answer=".length);
    }
  }

  // Try --spec flag; if absent, fall back to global state (supports IDLE)
  const specFlag = persistence.parseSpecFlag(cleanArgs);
  let state: schema.StateFile;
  try {
    state = await persistence.resolveState(root, specFlag);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await formatter.writeFormatted({ error: msg }, fmt);
    return results.fail({ exitCode: 1 });
  }

  // If no --spec and we're in a spec-active phase, require it
  if (
    specFlag === null &&
    state.phase !== "IDLE" &&
    state.phase !== "COMPLETED"
  ) {
    await formatter.writeFormatted(
      {
        error:
          "Error: --spec=<name> is required. Use `noskills spec list` to see available specs.",
      },
      fmt,
    );
    return results.fail({ exitCode: 1 });
  }
  const config = await persistence.readManifest(root);

  // Set command prefix from manifest for cmd() / cmdPrefix() calls
  if (config?.command !== undefined) {
    const { setCommandPrefix } = await import("../output/cmd.ts");
    setCommandPrefix(config.command);
  }

  if (config === null) {
    await formatter.writeFormatted({ error: "No config found" }, fmt);

    return results.fail({ exitCode: 1 });
  }

  // State integrity check: verify active spec directory exists
  if (
    state.spec !== null && state.phase !== "IDLE" && state.phase !== "COMPLETED"
  ) {
    const specDir = `${root}/${persistence.paths.specDir(state.spec)}`;
    try {
      await runtime.fs.stat(specDir);
    } catch {
      await formatter.writeFormatted({
        error: true,
        message:
          `Active spec '${state.spec}' directory not found. Files may have been deleted manually.`,
        suggestion: `Run \`${cmd("reset")}\` to return to idle, or \`${
          cmd("cancel")
        }\` to mark as cancelled.`,
      }, fmt);
      return results.fail({ exitCode: 1 });
    }
  }

  // Detect audience mode and persist on discovery state
  const audience = mode.detectMode(cleanArgs, config);
  if (state.phase === "DISCOVERY" && state.discovery.audience !== audience) {
    state = { ...state, discovery: { ...state.discovery, audience } };
  }

  // Load active concerns
  const allConcerns = await persistence.listConcerns(root);
  const activeConcerns = allConcerns.filter((c) =>
    config.concerns.includes(c.id)
  );

  // Handle --answer
  if (answerText !== null) {
    const answerUser = await identity.resolveUser(root);
    const newState = await handleAnswer(
      root,
      state,
      config,
      activeConcerns,
      answerText,
      answerUser,
    );
    await persistence.writeStateAndSpec(root, newState);

    // Update lastCalledAt and recompile
    const touchedState = {
      ...newState,
      lastCalledAt: new Date().toISOString(),
    };
    await persistence.writeStateAndSpec(root, touchedState);

    // Sync session phase if NOSKILLS_SESSION is set
    const sessionId = runtime.env.get("NOSKILLS_SESSION") ?? null;
    if (sessionId !== null) {
      await persistence.updateSessionPhase(
        root,
        sessionId,
        touchedState.phase,
      );
    }

    const scopedRules = await syncEngine.loadScopedRules(root);
    const { tier1, tier2Count } = syncEngine.splitByTier(
      scopedRules,
      touchedState.phase,
    );
    const parsed = touchedState.spec !== null
      ? await specParser.parseSpec(root, touchedState.spec)
      : null;
    // Collect folder rules from touched files (state + hook log)
    const touchedFiles = await collectTouchedFiles(root, touchedState);
    const fRules = await folderRules.collectFolderRules(root, touchedFiles);
    const hints = syncEngine.resolveInteractionHints(config?.tools ?? []);
    const user = await identity.resolveUser(root);
    const output = await compiler.compile(
      touchedState,
      activeConcerns,
      tier1,
      config,
      parsed,
      fRules,
      undefined,
      hints,
      user,
      tier2Count,
      root,
    );

    // Inject saved flag when "save" was the answer and phase didn't change
    const isSaveAnswer = answerText.trim().toLowerCase() === "save";
    const phaseSame = touchedState.phase === state.phase;
    if (
      isSaveAnswer && phaseSame &&
      (touchedState.phase === "SPEC_DRAFT" ||
        touchedState.phase === "SPEC_APPROVED")
    ) {
      const savedInstruction = touchedState.phase === "SPEC_DRAFT"
        ? "Spec draft saved. The spec stays in DRAFT and can be reviewed by anyone. Other users can add ACs (`ac add`), notes (`note add`), or tasks (`task add`) while in draft. When ready, any user can approve with `noskills spec <name> approve`."
        : 'Spec is approved and parked. Others can still add ACs or notes. When ready, run `noskills next --answer="start"` to begin execution.';
      const savedOutput = {
        ...output,
        instruction: savedInstruction,
        saved: true,
      };
      await formatter.writeFormatted(savedOutput, fmt);
      return results.ok(undefined);
    }

    await formatter.writeFormatted(output, fmt);

    return results.ok(undefined);
  }

  // Update lastCalledAt timestamp
  const touchedState = { ...state, lastCalledAt: new Date().toISOString() };
  await persistence.writeStateAndSpec(root, touchedState);

  // Sync session phase
  const noAnswerSessionId = runtime.env.get("NOSKILLS_SESSION") ??
    null;
  if (noAnswerSessionId !== null) {
    await persistence.updateSessionPhase(
      root,
      noAnswerSessionId,
      touchedState.phase,
    );
  }

  // No answer — just output current instruction
  const scopedRules = await syncEngine.loadScopedRules(root);
  const { tier1: noAnswerTier1, tier2Count: noAnswerTier2Count } = syncEngine
    .splitByTier(scopedRules, touchedState.phase);
  const parsed = touchedState.spec !== null
    ? await specParser.parseSpec(root, touchedState.spec)
    : null;
  const touchedFiles = await collectTouchedFiles(root, touchedState);
  const fRules = await folderRules.collectFolderRules(root, touchedFiles);

  // Build idle context if needed (spec list for welcome dashboard)
  let idleContext: compiler.IdleContext | undefined;
  if (touchedState.phase === "IDLE") {
    const specStates = await persistence.listSpecStates(root);
    idleContext = {
      existingSpecs: specStates.map((s) => ({
        name: s.name,
        phase: s.state.phase,
        iteration: s.state.execution.iteration,
        detail: s.state.phase === "EXECUTING"
          ? `${s.state.execution.completedTasks.length} tasks done, iteration ${s.state.execution.iteration}`
          : s.state.phase === "SPEC_DRAFT"
          ? "awaiting approval"
          : s.state.phase === "COMPLETED"
          ? "completed"
          : undefined,
      })),
      rulesCount: noAnswerTier1.length,
    };
  }

  const hints = syncEngine.resolveInteractionHints(config?.tools ?? []);
  const user = await identity.resolveUser(root);
  const output = await compiler.compile(
    touchedState,
    activeConcerns,
    noAnswerTier1,
    config,
    parsed,
    fRules,
    idleContext,
    hints,
    user,
    noAnswerTier2Count,
    root,
  );
  await formatter.writeFormatted(output, fmt);

  return results.ok(undefined);
};

// =============================================================================
// Answer Handling
// =============================================================================

export const handleAnswer = async (
  root: string,
  state: schema.StateFile,
  config: schema.NosManifest,
  activeConcerns: readonly schema.ConcernDefinition[],
  answer: string,
  user?: { name: string; email: string },
): Promise<schema.StateFile> => {
  switch (state.phase) {
    case "DISCOVERY": {
      // Listen first: store user context before mode selection
      const hasUserContext = state.discovery.userContext !== undefined &&
        state.discovery.userContext.length > 0;
      const hasDescription = state.specDescription !== null &&
        state.specDescription.length > 0;
      const discoveryMode = state.discovery.mode;

      if (!hasUserContext && discoveryMode === undefined && hasDescription) {
        // This is the user's initial context response
        return machine.setUserContext(state, answer);
      }

      // Mode selection (after user context received)
      if (discoveryMode === undefined && hasDescription) {
        const validModes: readonly schema.DiscoveryMode[] = [
          "full",
          "validate",
          "technical-depth",
          "ship-fast",
          "explore",
        ];
        if (validModes.includes(answer as schema.DiscoveryMode)) {
          return machine.setDiscoveryMode(
            state,
            answer as schema.DiscoveryMode,
          );
        }
        // Invalid mode — default to full
        return machine.setDiscoveryMode(state, "full");
      }

      // Premise challenge (after mode, before questions — only when mode is set)
      const premisesCompleted = state.discovery.premisesCompleted === true;
      if (discoveryMode !== undefined && !premisesCompleted) {
        try {
          const parsed = JSON.parse(answer);
          if (
            parsed !== null && typeof parsed === "object" &&
            "premises" in parsed
          ) {
            const rawPremises = parsed.premises as Array<
              { text: string; agreed: boolean; revision?: string }
            >;
            const typedPremises: schema.Premise[] = rawPremises
              .map((p) => ({
                text: p.text ?? "",
                agreed: p.agreed ?? true,
                revision: p.revision,
                user: user?.name ?? "Unknown User",
                timestamp: new Date().toISOString(),
              }));
            // Jidoka M3: reject empty premises array
            if (typedPremises.length === 0) {
              throw new Error(
                "Premise challenge requires at least one premise. Empty array rejected.",
              );
            }
            return machine.completePremises(state, typedPremises);
          }
        } catch {
          // Not JSON — reject (Jidoka M3: empty premises = re-prompt)
          throw new Error(
            "Premise challenge requires valid JSON with premises array. Re-prompt the user.",
          );
        }
        // If answer is JSON but missing premises key — reject
        throw new Error(
          "Premise challenge requires a premises array. Cannot skip with empty input.",
        );
      }

      const isAgent = state.discovery.audience === "agent";

      // Try parsing answer as JSON object for batch submission
      let answersMap: Record<string, string> | null = null;
      try {
        const parsed = JSON.parse(answer);
        if (
          typeof parsed === "object" && parsed !== null &&
          !Array.isArray(parsed)
        ) {
          if (isAgent) {
            // Agent mode: only batch if ALL required question IDs are present
            const requiredIds = questions.QUESTIONS.map((q) => q.id);
            const hasAll = requiredIds.every((id) => id in parsed);
            if (hasAll) {
              answersMap = parsed as Record<string, string>;
            }
          } else {
            // Human mode: any JSON object is treated as batch
            answersMap = parsed as Record<string, string>;
          }
        }
      } catch {
        // Not JSON — fall through to single answer mode
      }

      let newState = state;

      if (answersMap !== null) {
        // Batch mode: add all answers at once (human/agentless CLI)
        // Jidoka C1: flag batch submissions for mandatory user confirmation
        for (const [qId, qAnswer] of Object.entries(answersMap)) {
          if (typeof qAnswer === "string" && qAnswer.length > 0) {
            newState = machine.addDiscoveryAnswer(newState, qId, qAnswer, user);
          }
        }
        // Mark that answers were batch-submitted (needs explicit user confirmation)
        newState = {
          ...newState,
          discovery: {
            ...newState.discovery,
            batchSubmitted: true,
          },
        };
      } else {
        // Single answer mode (agent one-at-a-time): answer current question and advance
        const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
        const currentIdx = newState.discovery.currentQuestion;
        const currentQ = allQuestions[currentIdx];

        if (currentQ === undefined) return state;
        newState = machine.addDiscoveryAnswer(
          newState,
          currentQ.id,
          answer,
          user,
        );
        newState = machine.advanceDiscoveryQuestion(newState);
      }

      // Check if discovery is complete — transition to DISCOVERY_REVIEW
      if (questions.isDiscoveryComplete(newState.discovery.answers)) {
        newState = machine.completeDiscovery(newState);
      }

      return newState;
    }

    case "DISCOVERY_REVIEW": {
      const trimmed = answer.trim().toLowerCase();

      // "approve" → check for split proposal, then alternatives step
      if (trimmed === "approve") {
        const proposal = splitDetector.analyzeForSplit(
          state.discovery.answers,
        );
        if (proposal.detected && proposal.proposals.length >= 2) {
          // Stay in DISCOVERY_REVIEW with approved flag — let user decide on split
          return machine.approveDiscoveryAnswers(state);
        }
        // No split detected — check if new discovery flow is active (mode set)
        // If mode is set, stay for alternatives step; otherwise go to SPEC_DRAFT (backward compat)
        if (state.discovery.mode !== undefined) {
          return machine.approveDiscoveryAnswers(state);
        }
        // Backward compat: no mode → direct to SPEC_DRAFT
        return machine.approveDiscoveryReview(state);
      }

      // "split" → create sub-specs, cancel parent
      if (trimmed === "split") {
        return await handleSplit(root, state);
      }

      // "keep" → user chose to keep as one spec despite split proposal → transition to SPEC_DRAFT
      if (trimmed === "keep") {
        const newState = machine.addDecision(state, {
          id: `decision-split-keep-${Date.now()}`,
          question: "Split spec into separate areas?",
          choice:
            "Chose to keep as single spec despite multiple areas detected",
          promoted: false,
          timestamp: new Date().toISOString(),
        });
        return machine.approveDiscoveryReview(newState);
      }

      // Alternatives selection (after approved, before SPEC_DRAFT transition)
      const alternativesPresented =
        state.discovery.alternativesPresented === true;
      if (state.discovery.approved && !alternativesPresented) {
        let updatedState: schema.StateFile;
        // Check if user wants to skip
        if (trimmed === "skip" || trimmed === "none") {
          updatedState = machine.skipAlternatives(state);
        } else {
          // Try parsing approach selection
          let handled = false;
          try {
            const parsed = JSON.parse(answer);
            if (
              parsed !== null && typeof parsed === "object" &&
              "approach" in parsed
            ) {
              const approach: schema.SelectedApproach = {
                id: String(parsed.approach),
                name: String(parsed.name ?? parsed.approach),
                summary: String(parsed.summary ?? ""),
                effort: String(parsed.effort ?? ""),
                risk: String(parsed.risk ?? ""),
                user: user?.name ?? "Unknown User",
                timestamp: new Date().toISOString(),
              };
              updatedState = machine.selectApproach(state, approach);
              handled = true;
            }
          } catch {
            // Not JSON
          }
          if (!handled) {
            // Default: skip alternatives
            updatedState = machine.skipAlternatives(state);
          }
        }
        // After alternatives step, transition to SPEC_DRAFT
        return machine.approveDiscoveryReview(updatedState!);
      }

      // Revision: parse JSON with { revise: { questionId: "corrected answer" } }
      try {
        const parsed = JSON.parse(answer);
        if (typeof parsed.revise === "object" && parsed.revise !== null) {
          let newState = state;
          for (
            const [qId, qAnswer] of Object.entries(
              parsed.revise as Record<string, string>,
            )
          ) {
            if (typeof qAnswer === "string" && qAnswer.length > 0) {
              newState = machine.addDiscoveryAnswer(
                newState,
                qId,
                qAnswer,
                user,
              );
            }
          }
          // Stay in DISCOVERY_REVIEW — updated answers, re-show for confirmation
          return newState;
        }
      } catch {
        // Not JSON — ignore
      }

      return state;
    }

    case "SPEC_DRAFT": {
      // "save" — keep draft as-is, phase stays SPEC_DRAFT
      if (answer.trim().toLowerCase() === "save") {
        return state;
      }

      // Classification answer — parse and store, then generate spec
      if (state.classification === null) {
        let classification: schema.SpecClassification;

        // Shortcut: "none" or "skip" means all flags false
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === "none" || trimmed === "skip") {
          classification = {
            involvesWebUI: false,
            involvesCLI: false,
            involvesPublicAPI: false,
            involvesMigration: false,
            involvesDataHandling: false,
          };
        } else {
          try {
            const parsed = JSON.parse(answer);
            classification = {
              involvesWebUI: parsed.involvesWebUI === true ||
                parsed.involvesUI === true,
              involvesCLI: parsed.involvesCLI === true ||
                parsed.involvesUI === true,
              involvesPublicAPI: parsed.involvesPublicAPI === true,
              involvesMigration: parsed.involvesMigration === true,
              involvesDataHandling: parsed.involvesDataHandling === true,
            };
          } catch {
            // If not JSON, default to all false
            classification = {
              involvesWebUI: false,
              involvesCLI: false,
              involvesPublicAPI: false,
              involvesMigration: false,
              involvesDataHandling: false,
            };
          }
        }

        const newState = { ...state, classification };

        // Now generate spec.md with classification
        try {
          await specGenerator.generateSpec(
            root,
            newState,
            activeConcerns,
          );
        } catch {
          // Keep classification even if spec gen fails
        }

        return newState;
      }

      // Already classified — check for refinement
      try {
        const parsed = JSON.parse(answer);
        if (
          typeof parsed.refinement === "string" &&
          parsed.refinement.length > 0
        ) {
          const refinementText = parsed.refinement;

          if (state.spec !== null) {
            const specFile = `${root}/${
              persistence.paths.specFile(state.spec)
            }`;
            const currentContent = await runtime.fs.readTextFile(specFile);

            // If refinement contains "task-" patterns, replace the Tasks section
            if (refinementText.includes("task-")) {
              // Split ONLY on "task-N:" prefix boundaries, preserving full descriptions
              const taskLines = parseRefinementTasks(refinementText);
              const newTasksSection = taskLines.map(
                (t: string) => `- [ ] ${t}`,
              ).join("\n");

              // Replace the ## Tasks section in the spec
              const tasksRegex = /## Tasks\n\n([\s\S]*?)(?=\n## |\n*$)/;
              const updatedContent = currentContent.replace(
                tasksRegex,
                `## Tasks\n\n${newTasksSection}\n`,
              );
              await runtime.fs.writeTextFile(specFile, updatedContent);
            }
          }

          return state; // Stay in SPEC_DRAFT
        }
      } catch {
        // Not JSON — ignore
      }

      return state;
    }

    case "SPEC_APPROVED": {
      // "save" — keep approved spec parked, don't start execution
      if (answer.trim().toLowerCase() === "save") {
        return state;
      }

      // User is ready — start execution
      const execState = machine.startExecution(state);

      // Update spec.md: "approved" → "executing"
      if (execState.spec !== null) {
        await specUpdater.updateSpecStatus(root, execState.spec, "executing");
        await specUpdater.updateProgressStatus(
          root,
          execState.spec,
          "executing",
        );
      }

      return execState;
    }

    case "EXECUTING": {
      // Step 1: Agent says "done" → run verification first, then maybe status report
      if (!state.execution.awaitingStatusReport) {
        let newState = {
          ...state,
          execution: {
            ...state.execution,
            lastProgress: answer,
          },
        };

        // Run verification if configured (automated backpressure)
        if (
          config.verifyCommand !== null && config.verifyCommand !== undefined &&
          config.verifyCommand.length > 0
        ) {
          const verification = await runVerification(
            root,
            config.verifyCommand,
          );
          newState = {
            ...newState,
            execution: {
              ...newState.execution,
              lastVerification: verification,
            },
          };

          // If verification failed, do NOT ask for status report — just return
          // the failure. Agent must fix and try again.
          if (!verification.passed) {
            return newState;
          }
        }

        // Verification passed (or not configured) — ask for status report
        newState = {
          ...newState,
          execution: {
            ...newState.execution,
            awaitingStatusReport: true,
          },
        };

        return newState;
      }

      // Step 2: Agent submits status report JSON → process it
      return await processStatusReport(root, state, answer, activeConcerns);
    }

    case "BLOCKED": {
      // Unblock, record the resolution as a decision, return to execution
      const reason = state.execution.lastProgress ?? "Unknown";
      const decision: schema.Decision = {
        id: `d${state.decisions.length + 1}`,
        question: reason.replace(/^BLOCKED:\s*/, ""),
        choice: answer,
        promoted: false, // User can promote later via `rule add`
        timestamp: new Date().toISOString(),
      };

      let newState = machine.addDecision(state, decision);
      newState = machine.transition(newState, "EXECUTING");
      newState = {
        ...newState,
        execution: {
          ...newState.execution,
          lastProgress: `Resolved: ${answer}`,
        },
      };

      return newState;
    }

    default:
      return state;
  }
};

// =============================================================================
// Split Handling
// =============================================================================

const handleSplit = async (
  root: string,
  state: schema.StateFile,
): Promise<schema.StateFile> => {
  // Run split analysis
  const proposal = splitDetector.analyzeForSplit(state.discovery.answers);
  if (!proposal.detected || proposal.proposals.length === 0) {
    return state; // No split possible
  }

  const childNames: string[] = [];

  for (const item of proposal.proposals) {
    // Create spec directory
    const specDir = `${root}/${persistence.paths.specDir(item.name)}`;
    await runtime.fs.mkdir(specDir, { recursive: true });

    // Pre-fill discovery answers (only relevant ones)
    const relevantAnswers = state.discovery.answers.filter(
      (a) => item.relevantAnswers.includes(a.questionId),
    );

    // Create child state at DISCOVERY_REVIEW (answers pre-filled)
    const childState = machine.startSpec(
      schema.createInitialState(),
      item.name,
      `spec/${item.name}`,
    );

    // Add relevant answers
    let filledState = childState;
    for (const a of relevantAnswers) {
      filledState = machine.addDiscoveryAnswer(
        filledState,
        a.questionId,
        a.answer,
      );
    }

    // Transition to DISCOVERY_REVIEW
    filledState = machine.completeDiscovery(filledState);

    await persistence.writeSpecState(root, item.name, filledState);
    childNames.push(item.name);
  }

  // Cancel parent spec
  const parentCompleted = machine.completeSpec(
    state,
    "cancelled",
    `Split into: ${childNames.join(", ")}`,
  );

  return parentCompleted;
};

// =============================================================================
// Refinement Task Parsing
// =============================================================================

/**
 * Parse refinement text containing "task-N:" prefixed lines into task entries.
 * Splits ONLY on the task-N: prefix pattern, preserving full descriptions.
 */
export const parseRefinementTasks = (text: string): string[] => {
  return text
    .split(/(?=task-\d+:)/)
    .map((t) => t.replace(/[,;\n\s]+$/, "").trim())
    .filter((t) => /^task-\d+:/.test(t));
};

// =============================================================================
// Status Report Processing
// =============================================================================

const processStatusReport = async (
  root: string,
  state: schema.StateFile,
  answer: string,
  _activeConcerns: readonly schema.ConcernDefinition[],
): Promise<schema.StateFile> => {
  // Try to parse the agent's status report as JSON
  let report: {
    completed?: string[];
    remaining?: string[];
    blocked?: string[];
    na?: string[];
    newIssues?: string[];
  };

  try {
    report = JSON.parse(answer);
  } catch {
    // If it's not JSON, treat the whole answer as a completion note
    // and clear the status report request
    return {
      ...state,
      execution: {
        ...state.execution,
        lastProgress: answer,
        awaitingStatusReport: false,
      },
    };
  }

  // ── Legacy migration: string[] debt → DebtItem[] ──
  let currentState = state;

  if (
    state.execution.debt !== null && state.execution.debt.items.length > 0 &&
    typeof state.execution.debt.items[0] === "string"
  ) {
    const legacyItems = state.execution.debt.items as unknown as string[];
    const migratedItems: schema.DebtItem[] = legacyItems.map((text, i) => ({
      id: `legacy-${i + 1}`,
      text,
      since: state.execution.debt!.fromIteration,
    }));
    currentState = {
      ...state,
      execution: {
        ...state.execution,
        debt: { ...state.execution.debt!, items: migratedItems },
      },
    };
    // Log migration for observability
    const encoder = new TextEncoder();
    const writer = runtime.process.stderr.getWriter();
    await writer.write(
      encoder.encode(
        "noskills: migrated legacy string[] debt to DebtItem[] format\n",
      ),
    );
    writer.releaseLock();
  }

  // ── Mandatory AC rejection ──
  // mandatory-tests and mandatory-docs cannot be marked N/A without justification
  const MANDATORY_AC_IDS = new Set(["mandatory-tests", "mandatory-docs"]);
  const naRaw = report.na ?? [];
  const rejectedMandatory = naRaw.filter((id) => MANDATORY_AC_IDS.has(id));
  if (rejectedMandatory.length > 0) {
    // Reject: return state unchanged with a rejection note in lastProgress
    return {
      ...currentState,
      execution: {
        ...currentState.execution,
        lastProgress:
          `REJECTED: Tests and documentation ACs require explicit justification to mark as N/A. Explain why tests or docs are not needed for this spec. Rejected IDs: ${
            rejectedMandatory.join(", ")
          }`,
        awaitingStatusReport: true,
      },
    };
  }

  // ── ID-based debt matching ──
  // completed/remaining/blocked: arrays of IDs referencing existing debt/AC items
  // na: IDs that don't apply to this task — removed permanently
  // newIssues: free-text strings for issues discovered during implementation
  const completedIds = report.completed ?? [];
  const completedSet = new Set(completedIds);
  const naIds = report.na ?? [];
  const naSet = new Set(naIds);
  const newIssueTexts = report.newIssues ?? [];
  const remainingIds = report.remaining ?? [];
  const blockedIds = report.blocked ?? [];
  const prevUnaddressed = currentState.execution.debt?.unaddressedIterations ??
    0;

  // Filter out completed AND N/A items from existing debt (match by ID)
  const survivingOldDebt = currentState.execution.debt !== null
    ? currentState.execution.debt.items.filter(
      (item) => !completedSet.has(item.id) && !naSet.has(item.id),
    )
    : [];

  // Create new debt items from newIssues with auto-increment IDs
  const counter = currentState.execution.debtCounter ?? 0;
  const newDebtItems: schema.DebtItem[] = newIssueTexts.map((text, i) => ({
    id: `debt-${counter + i + 1}`,
    text,
    since: currentState.execution.iteration,
  }));

  // Merge surviving old debt + newly discovered issues
  const allDebtItems = [...survivingOldDebt, ...newDebtItems];

  // Explicit completion signal: remaining=[] AND blocked=[] AND no new issues
  // When the agent says nothing remains, trust it — accept in one round-trip
  const explicitlyComplete = remainingIds.length === 0 &&
    blockedIds.length === 0 && newIssueTexts.length === 0;

  const mergedDebt: schema.DebtState | null =
    (explicitlyComplete || allDebtItems.length === 0) ? null : {
      items: allDebtItems,
      fromIteration: currentState.execution.debt?.fromIteration ??
        currentState.execution.iteration,
      unaddressedIterations: survivingOldDebt.length > 0
        ? prevUnaddressed + 1
        : 1,
    };

  // Persist N/A'd items so they're excluded from future criteria
  const updatedNaItems = [
    ...new Set([...(currentState.execution.naItems ?? []), ...naIds]),
  ];

  const progressParts: string[] = [];
  if (completedIds.length > 0) {
    progressParts.push(`Completed: ${completedIds.join(", ")}`);
  }
  if (naIds.length > 0) progressParts.push(`N/A: ${naIds.join(", ")}`);
  const progressSummary = progressParts.length > 0
    ? progressParts.join("; ")
    : "Status report submitted";

  // Task fully accepted: zero debt AND verification passed (or no verify configured)
  const verifyPassed = currentState.execution.lastVerification === null ||
    currentState.execution.lastVerification.passed === true;
  const taskComplete = mergedDebt === null && verifyPassed;

  // Updated debtCounter
  const newDebtCounter = counter + newIssueTexts.length;

  // If task accepted, find the current task(s) and mark completed.
  // Supports batch: if the step-1 answer (lastProgress) contained a JSON
  // object with `completed: [id, ...]`, all matching tasks advance at once.
  if (taskComplete && currentState.spec !== null) {
    const parsed = await specParser.parseSpec(root, currentState.spec);
    if (parsed !== null) {
      const taskCompletedIds = currentState.execution.completedTasks ?? [];
      const taskCompletedSet = new Set(taskCompletedIds);

      // Try to extract batch task IDs from the step-1 answer (lastProgress)
      let batchIds: string[] = [];
      try {
        const prevAnswer = JSON.parse(
          currentState.execution.lastProgress ?? "",
        );
        if (Array.isArray(prevAnswer.completed)) {
          batchIds = (prevAnswer.completed as string[]).filter(
            (id: string) =>
              !taskCompletedSet.has(id) &&
              parsed.tasks.some((t) => t.id === id),
          );
        }
      } catch {
        // Not batch JSON — fall back to single task
      }

      // If no batch, find single current task (first incomplete)
      if (batchIds.length === 0) {
        const currentTask = parsed.tasks.find((t) =>
          !taskCompletedSet.has(t.id)
        );
        if (currentTask !== undefined) {
          batchIds = [currentTask.id];
        }
      }

      // Mark all batch tasks as completed
      const newlyCompleted: string[] = [];
      for (const taskId of batchIds) {
        await specUpdater.markTaskCompleted(root, currentState.spec, taskId);
        await specUpdater.updateProgressTask(
          root,
          currentState.spec,
          taskId,
          "done",
        );
        newlyCompleted.push(taskId);
      }

      if (newlyCompleted.length > 0) {
        const label = newlyCompleted.length === 1
          ? `Task ${newlyCompleted[0]} accepted`
          : `Tasks ${newlyCompleted.join(", ")} accepted`;

        return {
          ...currentState,
          execution: {
            ...currentState.execution,
            lastProgress: `${label}: ${progressSummary}`,
            awaitingStatusReport: false,
            debt: mergedDebt,
            completedTasks: [...taskCompletedIds, ...newlyCompleted],
            debtCounter: newDebtCounter,
            naItems: updatedNaItems,
          },
        };
      }
    }
  }

  return {
    ...currentState,
    execution: {
      ...currentState.execution,
      lastProgress: taskComplete
        ? progressSummary
        : `Task not accepted — remaining items must be addressed first. ${progressSummary}`,
      awaitingStatusReport: false,
      debt: mergedDebt,
      debtCounter: newDebtCounter,
      naItems: updatedNaItems,
    },
  };
};

// =============================================================================
// Verification Runner
// =============================================================================

const runVerification = async (
  root: string,
  command: string,
): Promise<schema.VerificationResult> => {
  try {
    const { execSync } = await import("node:child_process");
    const output = execSync(command, {
      cwd: root,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      passed: true,
      output: String(output).slice(0, 4000),
      timestamp: new Date().toISOString(),
    };
  } catch (err: unknown) {
    // execSync throws on non-zero exit — capture output from the error
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    const output = ((execErr.stdout ?? "") + (execErr.stderr ?? "")).slice(
      0,
      4000,
    );

    if (execErr.status !== undefined) {
      // Command ran but returned non-zero exit code — verification failed
      return {
        passed: false,
        output: output || "Verification failed with no output",
        timestamp: new Date().toISOString(),
      };
    }

    // Command failed to execute entirely
    const message = err instanceof Error ? err.message : String(err);

    return {
      passed: false,
      output: `Verification command failed to execute: ${message}`,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Collect all touched files from two sources:
 * 1. state.execution.modifiedFiles — snapshot from stop hook at iteration end
 * 2. .eser/.state/files-changed.jsonl — real-time log from post-file-write hook
 *
 * Both sources are merged and deduplicated.
 */
const collectTouchedFiles = async (
  root: string,
  state: schema.StateFile,
): Promise<readonly string[]> => {
  const fromState = [...(state.execution.modifiedFiles ?? [])];
  const fromLog = await readFilesChangedLog(root);
  const merged = new Set([...fromState, ...fromLog]);

  return [...merged];
};

const readFilesChangedLog = async (
  root: string,
): Promise<readonly string[]> => {
  const logFile = `${root}/${persistence.paths.stateDir}/files-changed.jsonl`;

  try {
    const content = await runtime.fs.readTextFile(logFile);
    const lines = content.trim().split("\n").filter(Boolean);
    const files: string[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { file: string };
        if (!files.includes(entry.file)) {
          files.push(entry.file);
        }
      } catch {
        // skip malformed lines
      }
    }

    return files;
  } catch {
    return [];
  }
};
