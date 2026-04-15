// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Spec updater — keeps `spec.md` and `progress.json` in sync with state.
 *
 * `spec.md` is the git-tracked source of truth visible to teammates in PRs.
 * This module updates it at each lifecycle transition so it reflects reality.
 *
 * @module
 */

import * as persistence from "../state/persistence.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// spec.md updates
// =============================================================================

/** Update the "## Status:" line in spec.md. */
export const updateSpecStatus = async (
  root: string,
  specName: string,
  newStatus: string,
): Promise<void> => {
  const specFile = `${root}/${persistence.paths.specFile(specName)}`;

  try {
    let content = await runtime.fs.readTextFile(specFile);
    content = content.replace(
      /^## Status: .+$/m,
      `## Status: ${newStatus}`,
    );
    await runtime.fs.writeTextFile(specFile, content);
  } catch {
    // spec.md doesn't exist yet
  }
};

/** Mark a task as completed in spec.md: "- [ ] task-N:" → "- [x] task-N:" */
export const markTaskCompleted = async (
  root: string,
  specName: string,
  taskId: string,
): Promise<void> => {
  const specFile = `${root}/${persistence.paths.specFile(specName)}`;

  try {
    let content = await runtime.fs.readTextFile(specFile);
    // Replace "- [ ] task-N:" with "- [x] task-N:"
    const pattern = new RegExp(
      `^(- )\\[ \\]( ${taskId}:.*)$`,
      "m",
    );
    content = content.replace(pattern, "$1[x]$2");
    await runtime.fs.writeTextFile(specFile, content);
  } catch {
    // spec.md doesn't exist
  }
};

// =============================================================================
// progress.json updates
// =============================================================================

/** Update a task's status in progress.json. */
export const updateProgressTask = async (
  root: string,
  specName: string,
  taskId: string,
  status: "pending" | "done",
): Promise<void> => {
  const progressFile = `${root}/${
    persistence.paths.specDir(specName)
  }/progress.json`;

  try {
    const content = await runtime.fs.readTextFile(progressFile);
    const progress = JSON.parse(content) as {
      tasks: { id: string; title: string; status: string }[];
      [key: string]: unknown;
    };

    for (const task of progress.tasks) {
      if (task.id === taskId) {
        task.status = status;
      }
    }

    progress["updatedAt"] = new Date().toISOString();
    await runtime.fs.writeTextFile(
      progressFile,
      JSON.stringify(progress, null, 2) + "\n",
    );
  } catch {
    // progress.json doesn't exist
  }
};

/** Update the spec status field in progress.json. */
export const updateProgressStatus = async (
  root: string,
  specName: string,
  status: string,
): Promise<void> => {
  const progressFile = `${root}/${
    persistence.paths.specDir(specName)
  }/progress.json`;

  try {
    const content = await runtime.fs.readTextFile(progressFile);
    const progress = JSON.parse(content) as Record<string, unknown>;
    progress["status"] = status;
    progress["updatedAt"] = new Date().toISOString();
    await runtime.fs.writeTextFile(
      progressFile,
      JSON.stringify(progress, null, 2) + "\n",
    );
  } catch {
    // progress.json doesn't exist
  }
};
