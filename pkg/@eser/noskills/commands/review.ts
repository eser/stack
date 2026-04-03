// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills spec <name> review` — Show and answer pending delegations.
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
import * as dashboardEvents from "../dashboard/events.ts";
import * as questions from "../context/questions.ts";

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

  let state: schema.StateFile;
  try {
    state = await persistence.resolveState(root, specResult.spec);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(msg));
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const user = await identity.resolveUser(root);
  const delegations = state.discovery.delegations ?? [];

  // Filter to current user's pending delegations
  const myPending = delegations.filter(
    (d) => d.delegatedTo === user.name && d.status === "pending",
  );

  // Also show answered ones for context
  const myAnswered = delegations.filter(
    (d) => d.delegatedTo === user.name && d.status === "answered",
  );

  if (myPending.length === 0 && myAnswered.length === 0) {
    out.writeln(span.dim("No delegations for you on this spec."));
    await out.close();
    return results.ok(undefined);
  }

  // Get question texts
  const allConcerns = await persistence.listConcerns(root);
  const config = await persistence.readManifest(root);
  const activeConcerns = allConcerns.filter((c) =>
    config?.concerns.includes(c.id) ?? false
  );
  const allQuestions = questions.getQuestionsWithExtras(activeConcerns);
  const questionMap = new Map(allQuestions.map((q) => [q.id, q.text]));

  out.writeln(span.bold(`Spec: ${specResult.spec}`));
  out.writeln("");

  if (myPending.length > 0) {
    out.writeln(
      span.yellow(`You have ${myPending.length} pending delegation(s):`),
    );
    out.writeln("");
    for (let i = 0; i < myPending.length; i++) {
      const d = myPending[i]!;
      const qText = questionMap.get(d.questionId) ?? d.questionId;
      out.writeln(
        `  ${i + 1}. `,
        span.red("[PENDING]"),
        ` ${qText}`,
      );
      out.writeln(
        span.dim(
          `     Delegated by: ${d.delegatedBy} (${d.delegatedAt.slice(0, 10)})`,
        ),
      );
    }
  }

  if (myAnswered.length > 0) {
    out.writeln("");
    out.writeln(
      span.green(`${myAnswered.length} answered delegation(s):`),
    );
    for (const d of myAnswered) {
      const qText = questionMap.get(d.questionId) ?? d.questionId;
      out.writeln(`  `, span.green("✔"), ` ${qText}`);
      out.writeln(span.dim(`    Answer: ${d.answer?.slice(0, 80) ?? ""}`));
    }
  }

  // If --answer flag provided, answer a delegation
  let answerText: string | null = null;
  let answerIndex: number | null = null;
  for (const arg of args ?? []) {
    if (arg.startsWith("--answer=")) {
      answerText = arg.slice("--answer=".length);
    }
    if (arg.startsWith("--question=")) {
      answerIndex = parseInt(arg.slice("--question=".length), 10) - 1;
    }
  }

  if (
    answerText !== null && answerIndex !== null &&
    answerIndex >= 0 && answerIndex < myPending.length
  ) {
    const delegation = myPending[answerIndex]!;
    const newState = machine.answerDelegation(
      state,
      delegation.questionId,
      answerText,
      user.name,
    );
    await persistence.writeSpecState(root, specResult.spec, newState);

    await dashboardEvents.appendEvent(root, {
      ts: new Date().toISOString(),
      type: "delegation-answered" as dashboardEvents.EventType,
      spec: specResult.spec,
      user: user.name,
      question: delegation.questionId,
    });

    out.writeln("");
    out.writeln(
      span.green("✔"),
      ` Answered: ${delegation.questionId}`,
    );
  }

  await out.close();
  return results.ok(undefined);
};
