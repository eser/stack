// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills spec <name> followup <questionId> "question text"` — Add a follow-up question.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as identity from "../state/identity.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const { root } = await persistence.resolveProjectRoot();
  const specResult = persistence.requireSpecFlag(args);
  if (!specResult.ok) {
    out.writeln(span.red(specResult.error));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // Parse: followup <questionId> "question text"
  // Or: followup <followUpId> --answer="text"
  // Or: followup <followUpId> --skip
  const positionals = (args ?? []).filter((a) => !a.startsWith("--"));
  const questionId = positionals[0];
  const questionText = positionals.slice(1).join(" ");

  let answerText: string | null = null;
  let skip = false;
  for (const arg of args ?? []) {
    if (arg.startsWith("--answer=")) {
      answerText = arg.slice("--answer=".length);
    }
    if (arg === "--skip") {
      skip = true;
    }
  }

  if (!questionId) {
    out.writeln(
      span.red(
        'Usage: noskills spec <name> followup <questionId> "question text"',
      ),
    );
    out.writeln(
      span.dim(
        '  Or: noskills spec <name> followup <followUpId> --answer="text"',
      ),
    );
    out.writeln(
      span.dim("  Or: noskills spec <name> followup <followUpId> --skip"),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  let state: schema.StateFile;
  try {
    state = await persistence.resolveState(root, specResult.spec);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(msg));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // Answer an existing follow-up
  if (answerText !== null) {
    const newState = machine.answerFollowUp(state, questionId, answerText);
    await persistence.writeSpecState(root, specResult.spec, newState);
    out.writeln(span.green("✔"), ` Answered follow-up: ${questionId}`);
    await out.close();
    return results.ok(undefined);
  }

  // Skip an existing follow-up
  if (skip) {
    const newState = machine.skipFollowUp(state, questionId);
    await persistence.writeSpecState(root, specResult.spec, newState);
    out.writeln(span.green("✔"), ` Skipped follow-up: ${questionId}`);
    await out.close();
    return results.ok(undefined);
  }

  // Add a new follow-up
  if (questionText.length === 0) {
    out.writeln(span.red("Follow-up question text is required."));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  if (
    state.phase !== "DISCOVERY" && state.phase !== "DISCOVERY_REFINEMENT"
  ) {
    out.writeln(
      span.red(`Cannot add follow-ups in phase: ${state.phase}`),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const user = await identity.resolveUser(root);
  const newState = machine.addFollowUp(
    state,
    questionId,
    questionText,
    user.name,
  );
  await persistence.writeSpecState(root, specResult.spec, newState);

  const followUps = machine.getFollowUpsForQuestion(newState, questionId);
  const latest = followUps[followUps.length - 1];
  out.writeln(
    span.green("✔"),
    ` Follow-up added: ${latest?.id ?? questionId}`,
  );
  await out.close();

  return results.ok(undefined);
};
