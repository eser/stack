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
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const root = runtime.process.cwd();

  if (!(await persistence.isInitialized(root))) {
    const output = JSON.stringify({
      error: "noskills not initialized. Run: noskills init",
    });
    await writeStdout(output);

    return results.fail({ exitCode: 1 });
  }

  // Parse --answer flag
  let answerText: string | null = null;

  if (args !== undefined) {
    for (const arg of args) {
      if (arg.startsWith("--answer=")) {
        answerText = arg.slice("--answer=".length);
      }
    }
  }

  const state = await persistence.readState(root);
  const config = await persistence.readManifest(root);

  if (config === null) {
    const output = JSON.stringify({ error: "No config found" });
    await writeStdout(output);

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
    await persistence.writeState(root, newState);

    // Recompile with updated state
    const rules = await syncEngine.loadRules(root);
    const output = compiler.compile(newState, activeConcerns, rules);
    await writeStdout(JSON.stringify(output, null, 2));

    return results.ok(undefined);
  }

  // No answer — just output current instruction
  const rules = await syncEngine.loadRules(root);
  const output = compiler.compile(state, activeConcerns, rules);
  await writeStdout(JSON.stringify(output, null, 2));

  return results.ok(undefined);
};

// =============================================================================
// Answer Handling
// =============================================================================

import type * as schema from "../state/schema.ts";

const handleAnswer = async (
  root: string,
  state: schema.StateFile,
  _config: schema.NosManifest,
  activeConcerns: readonly schema.ConcernDefinition[],
  answer: string,
): Promise<schema.StateFile> => {
  switch (state.phase) {
    case "DISCOVERY": {
      // Find next unanswered question
      const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
      const nextQ = questions.getNextUnanswered(
        allQuestions,
        state.discovery.answers,
      );

      if (nextQ === null) {
        return state;
      }

      let newState = machine.addDiscoveryAnswer(state, nextQ.id, answer);

      // Check if discovery is complete
      if (questions.isDiscoveryComplete(newState.discovery.answers)) {
        // Generate spec draft first — if it fails, don't transition state
        const preTransitionState = newState;
        newState = machine.completeDiscovery(newState);

        try {
          await specGenerator.generateSpec(root, newState, activeConcerns);
        } catch {
          // Revert to pre-transition state if spec gen fails
          return preTransitionState;
        }
      }

      return newState;
    }

    case "SPEC_APPROVED": {
      // User is ready — start execution
      return machine.startExecution(state);
    }

    case "EXECUTING": {
      return machine.advanceExecution(state, answer);
    }

    case "BLOCKED": {
      // Unblock and return to execution, record the resolution
      let newState = machine.transition(state, "EXECUTING");
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
// Stdout Helper (raw JSON, no streams formatting)
// =============================================================================

const writeStdout = async (text: string): Promise<void> => {
  const encoder = new TextEncoder();
  const writer = runtime.process.stdout.getWriter();
  await writer.write(encoder.encode(text + "\n"));
  writer.releaseLock();
};
