// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills spec <name> delegate <questionId> <userName>` — Delegate a question.
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
import * as dashboardEvents from "../dashboard/events.ts";

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

  // Parse positional args: delegate <questionId> <userName>
  const positionals = (args ?? []).filter(
    (a) => !a.startsWith("--"),
  );
  const questionId = positionals[0];
  const userName = positionals.slice(1).join(" ");

  if (!questionId || !userName) {
    out.writeln(
      span.red(
        "Usage: noskills spec <name> delegate <questionId> <userName>",
      ),
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

  if (
    state.phase !== "DISCOVERY" && state.phase !== "DISCOVERY_REFINEMENT"
  ) {
    out.writeln(
      span.red(
        `Cannot delegate in phase: ${state.phase}. Only during discovery.`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const user = await identity.resolveUser(root);
  const newState = machine.addDelegation(
    state,
    questionId,
    userName,
    user.name,
  );
  await persistence.writeSpecState(root, specResult.spec, newState);

  await dashboardEvents.appendEvent(root, {
    ts: new Date().toISOString(),
    type: "delegation-created" as dashboardEvents.EventType,
    spec: specResult.spec,
    user: user.name,
    question: questionId,
    from: user.name,
    to: userName,
  });

  out.writeln(
    span.green("✔"),
    ` Delegated "${questionId}" to ${userName}`,
  );
  await out.close();

  return results.ok(undefined);
};
