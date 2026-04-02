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
  classification?: schema.SpecClassification | null,
): readonly string[] => {
  const reminders: string[] = [];

  for (const concern of concerns) {
    for (const reminder of concern.reminders) {
      // Filter by classification when available
      if (classification !== null && classification !== undefined) {
        const lower = reminder.toLowerCase();

        // AI slop / design-specific → only when involvesWebUI
        if (
          (lower.includes("slop") || lower.includes("ui element") ||
            lower.includes("design intentionality") ||
            lower.includes("interaction states") ||
            lower.includes("edge case check") ||
            lower.includes("loading state")) &&
          !classification.involvesWebUI
        ) {
          continue;
        }

        // API documentation → only when involvesPublicAPI
        if (
          (lower.includes("api doc") || lower.includes("endpoint should be")) &&
          !classification.involvesPublicAPI
        ) {
          continue;
        }
      }

      reminders.push(`${concern.id}: ${reminder}`);
    }
  }

  return reminders;
};

/** Check if a reminder is file-type-specific (UI/API/migration). */
const isFileSpecificReminder = (reminder: string): boolean => {
  const lower = reminder.toLowerCase();
  return lower.includes("slop") || lower.includes("ui element") ||
    lower.includes("design intentionality") ||
    lower.includes("interaction states") ||
    lower.includes("edge case check") ||
    lower.includes("loading state") ||
    lower.includes("api doc") || lower.includes("endpoint should be") ||
    lower.includes("migration") || lower.includes("rollback");
};

/** Split reminders into tier1 (general, compile-time) and tier2 (file-specific, hook-time). */
export const splitRemindersByTier = (
  concerns: readonly schema.ConcernDefinition[],
): { tier1: readonly string[]; tier2: readonly string[] } => {
  const tier1: string[] = [];
  const tier2: string[] = [];

  for (const concern of concerns) {
    for (const reminder of concern.reminders) {
      const prefixed = `${concern.id}: ${reminder}`;
      if (isFileSpecificReminder(reminder)) {
        tier2.push(prefixed);
      } else {
        tier1.push(prefixed);
      }
    }
  }

  return { tier1, tier2 };
};

/** Get tier2 reminders applicable to a specific file extension. */
export const getTier2RemindersForFile = (
  concerns: readonly schema.ConcernDefinition[],
  filePath: string,
  classification?: schema.SpecClassification | null,
): readonly string[] => {
  const ext = filePath.includes(".") ? `.${filePath.split(".").pop()!}` : "";
  const isUI = [".tsx", ".jsx", ".html", ".css", ".svelte", ".vue"].includes(
    ext,
  );
  const isAPI = [".ts", ".go", ".py", ".rs"].includes(ext);

  const reminders: string[] = [];

  for (const concern of concerns) {
    for (const reminder of concern.reminders) {
      if (!isFileSpecificReminder(reminder)) continue;

      const lower = reminder.toLowerCase();

      // UI reminders → only for UI files
      if (
        (lower.includes("slop") || lower.includes("ui element") ||
          lower.includes("design intentionality") ||
          lower.includes("interaction states") ||
          lower.includes("edge case check") ||
          lower.includes("loading state")) && !isUI
      ) {
        continue;
      }

      // API reminders → only for API files with involvesPublicAPI
      if (
        (lower.includes("api doc") || lower.includes("endpoint should be")) &&
        (!isAPI || !classification?.involvesPublicAPI)
      ) {
        continue;
      }

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
