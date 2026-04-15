// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Spec generator — creates .eser/specs/{name}/spec.md from discovery answers.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as template from "./template.ts";
import { parseSpecContent } from "./parser.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Generate
// =============================================================================

export const generateSpec = async (
  root: string,
  state: schema.StateFile,
  concerns: readonly schema.ConcernDefinition[],
): Promise<string> => {
  if (state.spec === null) {
    throw new Error("No active spec");
  }

  const specDir = `${root}/${persistence.paths.specDir(state.spec)}`;
  const specFile = `${root}/${persistence.paths.specFile(state.spec)}`;

  await runtime.fs.mkdir(specDir, { recursive: true });

  const content = template.renderSpec(
    state.spec,
    state.discovery.answers,
    concerns,
    state.decisions,
    state.classification,
    state.customACs,
    state.specNotes,
    state.transitionHistory,
  );

  await runtime.fs.writeTextFile(specFile, content);

  // Parse the spec we just wrote to extract tasks
  const parsed = parseSpecContent(state.spec, content);

  // Generate initial progress.json (git-tracked, visible in PRs)
  const progressFile = `${specDir}/progress.json`;
  const progress = {
    spec: state.spec,
    status: "draft",
    tasks: parsed.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: "pending" as const,
    })),
    decisions: state.decisions.map((d) => ({
      question: d.question,
      choice: d.choice,
      promoted: d.promoted,
    })),
    debt: [],
    updatedAt: new Date().toISOString(),
  };
  await runtime.fs.writeTextFile(
    progressFile,
    JSON.stringify(progress, null, 2) + "\n",
  );

  return specFile;
};
