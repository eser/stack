// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills spec <name> followup <questionId> "question text"` adds a
 * follow-up question to a discovery answer;
 * `followup <followUpId> --answer="text"` and `followup <followUpId> --skip`
 * settle one. `noskills next` hands out pending follow-ups one at a time, and
 * settling the last one, once the base answers are in, completes discovery.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as identity from "../state/identity.ts";
import * as cmd from "../output/cmd.ts";

/**
 * Runs `followup`. `projectRoot` is the project to work on; without it the
 * command finds the project from the working directory.
 */
export const main = async (
  args?: readonly string[],
  projectRoot?: string,
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = projectRoot ?? (await persistence.resolveProjectRoot()).root;
  const prefix = await cmd.loadCommandPrefix(root);
  const specResult = persistence.requireSpecFlag(args, prefix);
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

  if (questionId === undefined || questionId === "") {
    out.writeln(
      span.red(
        `Usage: ${
          cmd.cmd(
            `spec ${specResult.spec} followup <questionId> "question text"`,
          )
        }`,
      ),
    );
    out.writeln(
      span.dim(
        `  Or: ${
          cmd.cmd(
            `spec ${specResult.spec} followup <followUpId> --answer="text"`,
          )
        }`,
      ),
    );
    out.writeln(
      span.dim(
        `  Or: ${
          cmd.cmd(`spec ${specResult.spec} followup <followUpId> --skip`)
        }`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  let state: schema.StateFile;
  try {
    state = await persistence.resolveState(root, specResult.spec, prefix);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(msg));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  // Answer or skip an existing follow-up
  if (answerText !== null || skip) {
    const pending = machine.getPendingFollowUps(state);
    if (!pending.some((f) => f.id === questionId)) {
      out.writeln(
        span.red(
          `No pending follow-up "${questionId}". Pending: ${
            pending.length === 0 ? "none" : pending.map((f) => f.id).join(", ")
          }.`,
        ),
      );
      await out.close();
      return results.fail({ exitCode: 1 });
    }

    const settled = answerText !== null
      ? machine.answerFollowUp(state, questionId, answerText)
      : machine.skipFollowUp(state, questionId);
    // The last pending follow-up, once the base answers are in, completes
    // discovery, as the last base answer does when none is pending.
    const newState = machine.completeDiscoveryWhenReady(settled);
    await persistence.writeStateAndSpec(root, newState);

    out.writeln(
      span.green("✔"),
      ` ${
        answerText !== null ? "Answered" : "Skipped"
      } follow-up: ${questionId}`,
    );
    if (newState.phase !== state.phase) {
      out.writeln(
        `Discovery complete. Run \`${
          cmd.cmd(`spec ${specResult.spec} next`)
        }\` for the review.`,
      );
    }
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
