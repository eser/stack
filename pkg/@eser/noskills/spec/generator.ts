// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Spec generator — creates .eser/specs/{name}/spec.md from discovery answers.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as template from "./template.ts";
import { runtime } from "@eser/standards/cross-runtime";

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
  );

  await runtime.fs.writeTextFile(specFile, content);

  return specFile;
};
