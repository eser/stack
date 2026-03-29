// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills approve` — Human approves phase transition.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import type * as shellArgs from "@eser/shell/args";
import * as persistence from "../state/persistence.ts";
import * as machine from "../state/machine.ts";
import * as specGenerator from "../spec/generator.ts";
import * as specUpdater from "../spec/updater.ts";
import { cmd } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const root = runtime.process.cwd();
  const specFlag = persistence.parseSpecFlag(args);
  const state = await persistence.resolveState(root, specFlag);
  const config = await persistence.readManifest(root);

  // State integrity check: verify active spec directory exists
  if (state.spec !== null) {
    const specDir = `${root}/${persistence.paths.specDir(state.spec)}`;
    try {
      await runtime.fs.stat(specDir);
    } catch {
      out.writeln(span.red(`Active spec '${state.spec}' directory not found.`));
      out.writeln(span.dim("Run `noskills reset` to return to IDLE."));
      await out.close();
      return results.fail({ exitCode: 1 });
    }
  }

  if (state.phase === "SPEC_DRAFT") {
    // If classification was skipped, generate spec with null classification
    // (defaults all concern sections to not relevant — clean spec)
    if (state.classification === null && state.spec !== null) {
      const allConcerns = await persistence.listConcerns(root);
      const active = allConcerns.filter((c) =>
        config?.concerns.includes(c.id) ?? false
      );

      try {
        await specGenerator.generateSpec(root, state, active);
      } catch {
        // spec dir may already exist
      }
    }

    const newState = machine.approveSpec(state);
    await persistence.writeState(root, newState);

    // Update spec.md: "draft" → "approved"
    if (newState.spec !== null) {
      await specUpdater.updateSpecStatus(root, newState.spec, "approved");
      await specUpdater.updateProgressStatus(root, newState.spec, "approved");
    }

    out.writeln(
      span.green("✔"),
      " Spec approved. Phase: ",
      span.cyan("SPEC_APPROVED"),
    );
    out.writeln(
      "When ready, run ",
      span.bold(`${cmd('next --answer="start"')}`),
      " to begin execution.",
    );
  } else if (state.phase === "DISCOVERY_REVIEW") {
    // Approve discovery review → transition to SPEC_DRAFT
    const newState = machine.approveDiscoveryReview(state);
    await persistence.writeState(root, newState);

    out.writeln(
      span.green("✔"),
      " Discovery answers approved. Phase: ",
      span.cyan("SPEC_DRAFT"),
    );
    out.writeln(
      "Review the spec and run ",
      span.bold(cmd("approve")),
      " again to approve.",
    );
  } else if (state.phase === "DISCOVERY" && state.discovery.completed) {
    // Already completed discovery, move to spec draft
    out.writeln(span.dim("Discovery complete. Spec draft already generated."));
    out.writeln(
      "Review the spec and run ",
      span.bold(cmd("approve")),
      " again when in SPEC_DRAFT phase.",
    );
  } else {
    out.writeln(span.red(`Cannot approve in phase: ${state.phase}`));
  }

  await out.close();

  return results.ok(undefined);
};
