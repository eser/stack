// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills next` — Get next instruction for agent (JSON to stdout).
 * `noskills next --answer="..."` — Submit answer and advance state.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as compiler from "../context/compiler.ts";
import * as questions from "../context/questions.ts";
import * as specGenerator from "../spec/generator.ts";
import * as syncEngine from "../sync/engine.ts";
import * as specParser from "../spec/parser.ts";
import * as specUpdater from "../spec/updater.ts";
import * as folderRules from "../context/folder-rules.ts";
import * as formatter from "../output/formatter.ts";
import { cmd } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root = runtime.process.cwd();
  const fmt = formatter.parseOutputFormat(args);
  const cleanArgs = formatter.stripOutputFlag(args);

  if (!(await persistence.isInitialized(root))) {
    const initConfig = await persistence.readManifest(root);
    await formatter.writeFormatted(
      { error: `noskills not initialized. Run: ${cmd("init", initConfig)}` },
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

  let state = await persistence.readState(root);
  const config = await persistence.readManifest(root);

  // If pendingClear is set, reset it — the agent called noskills next after /clear
  if (state.pendingClear) {
    state = { ...state, pendingClear: false };
    await persistence.writeStateAndSpec(root, state);
  }

  if (config === null) {
    await formatter.writeFormatted({ error: "No config found" }, fmt);

    return results.fail({ exitCode: 1 });
  }

  // Load active concerns
  const allConcerns = await persistence.listConcerns(root);
  const activeConcerns = allConcerns.filter((c) =>
    config.concerns.includes(c.id)
  );

  // Handle --answer
  if (answerText !== null) {
    const newState = await handleAnswer(
      root,
      state,
      config,
      activeConcerns,
      answerText,
    );
    await persistence.writeStateAndSpec(root, newState);

    // Update lastCalledAt and recompile
    const touchedState = {
      ...newState,
      lastCalledAt: new Date().toISOString(),
    };
    await persistence.writeStateAndSpec(root, touchedState);

    const rules = await syncEngine.loadRules(root);
    const parsed = touchedState.spec !== null
      ? await specParser.parseSpec(root, touchedState.spec)
      : null;
    // Collect folder rules from touched files (state + hook log)
    const touchedFiles = await collectTouchedFiles(root, touchedState);
    const fRules = await folderRules.collectFolderRules(root, touchedFiles);
    const output = compiler.compile(
      touchedState,
      activeConcerns,
      rules,
      config,
      parsed,
      fRules,
    );
    await formatter.writeFormatted(output, fmt);

    return results.ok(undefined);
  }

  // Update lastCalledAt timestamp
  const touchedState = { ...state, lastCalledAt: new Date().toISOString() };
  await persistence.writeStateAndSpec(root, touchedState);

  // No answer — just output current instruction
  const rules = await syncEngine.loadRules(root);
  const parsed = touchedState.spec !== null
    ? await specParser.parseSpec(root, touchedState.spec)
    : null;
  const touchedFiles = await collectTouchedFiles(root, touchedState);
  const fRules = await folderRules.collectFolderRules(root, touchedFiles);
  const output = compiler.compile(
    touchedState,
    activeConcerns,
    rules,
    config,
    parsed,
    fRules,
  );
  await formatter.writeFormatted(output, fmt);

  return results.ok(undefined);
};

// =============================================================================
// Answer Handling
// =============================================================================

import type * as schema from "../state/schema.ts";

const handleAnswer = async (
  root: string,
  state: schema.StateFile,
  config: schema.NosManifest,
  activeConcerns: readonly schema.ConcernDefinition[],
  answer: string,
): Promise<schema.StateFile> => {
  switch (state.phase) {
    case "DISCOVERY": {
      // Try parsing answer as JSON object with all answers at once
      let answersMap: Record<string, string> | null = null;
      try {
        const parsed = JSON.parse(answer);
        if (
          typeof parsed === "object" && parsed !== null &&
          !Array.isArray(parsed)
        ) {
          answersMap = parsed as Record<string, string>;
        }
      } catch {
        // Not JSON — treat as single answer for backward compat
      }

      let newState = state;

      if (answersMap !== null) {
        // Batch mode: add all answers at once
        for (const [qId, qAnswer] of Object.entries(answersMap)) {
          if (typeof qAnswer === "string" && qAnswer.length > 0) {
            newState = machine.addDiscoveryAnswer(newState, qId, qAnswer);
          }
        }
      } else {
        // Single answer mode (backward compat): find next unanswered question
        const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
        const nextQ = questions.getNextUnanswered(
          allQuestions,
          newState.discovery.answers,
        );

        if (nextQ === null) return state;
        newState = machine.addDiscoveryAnswer(newState, nextQ.id, answer);
      }

      // Check if discovery is complete — transition to SPEC_DRAFT
      // (spec.md generated later, after classification is provided)
      if (questions.isDiscoveryComplete(newState.discovery.answers)) {
        newState = machine.completeDiscovery(newState);
      }

      return newState;
    }

    case "SPEC_DRAFT": {
      // Classification answer — parse and store, then generate spec
      if (state.classification === null) {
        let classification: schema.SpecClassification;

        try {
          const parsed = JSON.parse(answer);
          classification = {
            involvesUI: parsed.involvesUI === true,
            involvesPublicAPI: parsed.involvesPublicAPI === true,
            involvesMigration: parsed.involvesMigration === true,
            involvesDataHandling: parsed.involvesDataHandling === true,
          };
        } catch {
          // If not JSON, default to all false
          classification = {
            involvesUI: false,
            involvesPublicAPI: false,
            involvesMigration: false,
            involvesDataHandling: false,
          };
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

      // Already classified — nothing to do in SPEC_DRAFT via --answer
      return state;
    }

    case "SPEC_APPROVED": {
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

  const completed = report.completed ?? [];
  const remaining = report.remaining ?? [];
  const blocked = report.blocked ?? [];

  // Carry forward remaining + blocked items as debt
  const debtItems = [...remaining, ...blocked];
  const prevUnaddressed = state.execution.debt?.unaddressedIterations ?? 0;

  const newDebt: schema.DebtState | null = debtItems.length > 0
    ? {
      items: debtItems,
      fromIteration: state.execution.iteration,
      unaddressedIterations: 1,
    }
    : null;

  // Merge with existing debt — don't silently drop old debt
  let mergedDebt = newDebt;

  if (state.execution.debt !== null && newDebt !== null) {
    // Combine: old debt items that aren't in completed + new remaining
    const completedSet = new Set(completed.map((c) => c.toLowerCase().trim()));
    const survivingOldDebt = state.execution.debt.items.filter(
      (item) => !completedSet.has(item.toLowerCase().trim()),
    );
    const allDebtItems = [...new Set([...survivingOldDebt, ...debtItems])];

    mergedDebt = allDebtItems.length > 0
      ? {
        items: allDebtItems,
        fromIteration: state.execution.debt.fromIteration,
        unaddressedIterations: survivingOldDebt.length > 0
          ? prevUnaddressed + 1
          : 1,
      }
      : null;
  } else if (state.execution.debt !== null && newDebt === null) {
    // Agent completed everything including old debt — check if old items cleared
    const completedSet = new Set(completed.map((c) => c.toLowerCase().trim()));
    const survivingOldDebt = state.execution.debt.items.filter(
      (item) => !completedSet.has(item.toLowerCase().trim()),
    );

    mergedDebt = survivingOldDebt.length > 0
      ? {
        items: survivingOldDebt,
        fromIteration: state.execution.debt.fromIteration,
        unaddressedIterations: prevUnaddressed + 1,
      }
      : null;
  }

  const progressSummary = completed.length > 0
    ? `Completed: ${completed.join(", ")}`
    : "Status report submitted";

  // Task fully accepted: zero debt AND verification passed (or no verify configured)
  const verifyPassed = state.execution.lastVerification === null ||
    state.execution.lastVerification.passed === true;
  const taskComplete = mergedDebt === null && verifyPassed;

  // If task accepted, find the current task and mark it completed
  if (taskComplete && state.spec !== null) {
    const parsed = await specParser.parseSpec(root, state.spec);
    if (parsed !== null) {
      const completedIds = state.execution.completedTasks ?? [];
      const completedSet = new Set(completedIds);
      const currentTask = parsed.tasks.find((t) => !completedSet.has(t.id));

      if (currentTask !== undefined) {
        // Update spec.md: "- [ ] task-N:" → "- [x] task-N:"
        await specUpdater.markTaskCompleted(root, state.spec, currentTask.id);
        // Update progress.json
        await specUpdater.updateProgressTask(
          root,
          state.spec,
          currentTask.id,
          "done",
        );

        // Add to completedTasks in state
        return {
          ...state,
          pendingClear: true,
          execution: {
            ...state.execution,
            lastProgress: `Task ${currentTask.id} accepted: ${progressSummary}`,
            awaitingStatusReport: false,
            debt: mergedDebt,
            completedTasks: [...completedIds, currentTask.id],
          },
        };
      }
    }
  }

  return {
    ...state,
    pendingClear: taskComplete,
    execution: {
      ...state.execution,
      lastProgress: taskComplete
        ? progressSummary
        : `Task not accepted — remaining items must be addressed first. ${progressSummary}`,
      awaitingStatusReport: false,
      debt: mergedDebt,
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
