// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Concern operations and loader.
 *
 * Built-in concern definitions live as JSON files in `defaults/concerns/`.
 * `loadDefaultConcerns()` reads them at runtime instead of embedding them
 * in source code.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import { DEFAULT_CONCERNS } from "../defaults/concerns/mod.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Concern Loader
// =============================================================================

/**
 * Load all concern JSON files from a directory.
 * Works for both `defaults/concerns/` (built-in) and `.eser/concerns/` (project).
 */
export const loadConcerns = async (
  dirPath: string,
): Promise<readonly schema.ConcernDefinition[]> => {
  // Collect filenames first, sort by name (numeric prefixes ensure order)
  const entries: { name: string }[] = [];

  try {
    for await (const entry of runtime.fs.readDir(dirPath)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        entries.push({ name: entry.name });
      }
    }
  } catch {
    // Directory doesn't exist yet
    return [];
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const concerns: schema.ConcernDefinition[] = [];

  for (const entry of entries) {
    const content = await runtime.fs.readTextFile(
      `${dirPath}/${entry.name}`,
    );
    concerns.push(JSON.parse(content) as schema.ConcernDefinition);
  }

  return concerns;
};

/**
 * Load built-in concerns. Embedded via static imports — works in all runtimes
 * including bundled npm packages where filesystem paths don't resolve.
 */
export const loadDefaultConcerns = (): Promise<
  readonly schema.ConcernDefinition[]
> => {
  return Promise.resolve(DEFAULT_CONCERNS);
};

// =============================================================================
// Concern Operations
// =============================================================================

export const getConcernExtras = (
  concerns: readonly schema.ConcernDefinition[],
  questionId: string,
): readonly schema.ConcernExtra[] => {
  const extras: schema.ConcernExtra[] = [];

  for (const concern of concerns) {
    for (const extra of concern.extras) {
      if (extra.questionId === questionId) {
        extras.push(extra);
      }
    }
  }

  return extras;
};

export const getReminders = (
  concerns: readonly schema.ConcernDefinition[],
): readonly string[] => {
  const reminders: string[] = [];

  for (const concern of concerns) {
    for (const reminder of concern.reminders) {
      reminders.push(`${concern.id}: ${reminder}`);
    }
  }

  return reminders;
};

export type ConcernTension = {
  readonly between: readonly string[];
  readonly issue: string;
};

export const detectTensions = (
  activeConcerns: readonly schema.ConcernDefinition[],
): readonly ConcernTension[] => {
  const tensions: ConcernTension[] = [];
  const ids = activeConcerns.map((c) => c.id);

  if (ids.includes("move-fast") && ids.includes("compliance")) {
    tensions.push({
      between: ["move-fast", "compliance"],
      issue:
        "Speed vs traceability — shortcuts may violate audit requirements.",
    });
  }

  if (ids.includes("move-fast") && ids.includes("long-lived")) {
    tensions.push({
      between: ["move-fast", "long-lived"],
      issue:
        "Shipping speed vs maintainability — tech debt decisions need human approval.",
    });
  }

  if (ids.includes("beautiful-product") && ids.includes("move-fast")) {
    tensions.push({
      between: ["beautiful-product", "move-fast"],
      issue: "Design polish vs speed — which UI states can be deferred?",
    });
  }

  return tensions;
};
