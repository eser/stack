// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Spec parser — reads spec.md and extracts structured content.
 *
 * noskills compiler uses this to deliver task content inline in the
 * EXECUTING output, so agents never need to read spec files directly.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

export type ParsedTask = {
  readonly id: string;
  readonly title: string;
  readonly files?: readonly string[];
};

export type ParsedSpec = {
  readonly name: string;
  readonly tasks: readonly ParsedTask[];
  readonly outOfScope: readonly string[];
  readonly verification: readonly string[];
};

// =============================================================================
// Parser
// =============================================================================

/** Parse spec.md into structured data. */
export const parseSpec = async (
  root: string,
  specName: string,
): Promise<ParsedSpec | null> => {
  const specPath = `${root}/.eser/specs/${specName}/spec.md`;

  let content: string;
  try {
    content = await runtime.fs.readTextFile(specPath);
  } catch {
    return null;
  }

  return parseSpecContent(specName, content);
};

/** Parse spec markdown content (pure function, testable). */
export const parseSpecContent = (
  specName: string,
  content: string,
): ParsedSpec => {
  const tasks: ParsedTask[] = [];
  const outOfScope: string[] = [];
  const verification: string[] = [];

  let currentSection = "";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Track current section
    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.slice(3).trim().toLowerCase();
      continue;
    }

    // Parse task checkboxes: - [ ] task-N: Title
    if (currentSection.startsWith("tasks")) {
      const taskMatch = trimmed.match(
        /^-\s*\[[ x]\]\s*(task-\d+):\s*(.+)$/i,
      );
      if (taskMatch !== null) {
        tasks.push({
          id: taskMatch[1]!,
          title: taskMatch[2]!.trim(),
        });
      }

      // Parse file hints: Files: `path/to/file.ts`, `path/to/other.ts`
      const filesMatch = trimmed.match(/^Files?:\s*(.+)$/i);
      if (filesMatch !== null && tasks.length > 0) {
        const last = tasks[tasks.length - 1]!;
        const fileList = filesMatch[1]!
          .split(",")
          .map((f) => f.trim().replace(/^`|`$/g, ""))
          .filter((f) => f.length > 0);
        if (fileList.length > 0) {
          tasks[tasks.length - 1] = { ...last, files: fileList };
        }
      }
    }

    // Parse out of scope items
    if (currentSection.startsWith("out of scope")) {
      if (trimmed.startsWith("- ")) {
        outOfScope.push(trimmed.slice(2).trim());
      }
    }

    // Parse verification items
    if (currentSection.startsWith("verification")) {
      if (trimmed.startsWith("- ")) {
        verification.push(trimmed.slice(2).trim());
      }
    }
  }

  return { name: specName, tasks, outOfScope, verification };
};

/** Find the next incomplete task given completed task IDs. */
export const findNextTask = (
  tasks: readonly ParsedTask[],
  completedTaskIds: readonly string[],
): ParsedTask | null => {
  const completed = new Set(completedTaskIds);

  for (const task of tasks) {
    if (!completed.has(task.id)) {
      return task;
    }
  }

  return null;
};
