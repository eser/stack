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
import { runtime } from "@eserstack/standards/cross-runtime";

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
    const filePath = `${dirPath}/${entry.name}`;
    const content = await runtime.fs.readTextFile(filePath);
    let parsed: schema.ConcernDefinition;
    try {
      parsed = JSON.parse(content) as schema.ConcernDefinition;
    } catch (err) {
      throw new Error(
        `Failed to parse concern at ${filePath}: ${(err as Error).message}. ` +
          `Expected ConcernDefinition shape — see README-HOW.md#authoring-a-concern`,
      );
    }

    // Load promptFile content and append to reminders (relative to concern's own dir)
    if (parsed.promptFile !== undefined) {
      const concernDir = filePath.substring(0, filePath.lastIndexOf("/"));
      const promptFilePath = `${concernDir}/${parsed.promptFile}`;
      try {
        const promptContent = await runtime.fs.readTextFile(promptFilePath);
        if (promptContent.trim().length > 0) {
          parsed = {
            ...parsed,
            reminders: [...parsed.reminders, promptContent.trim()],
          };
        }
      } catch {
        throw new Error(
          `promptFile not found for concern "${parsed.id}" at ${promptFilePath}. ` +
            `Resolve path relative to the concern's own JSON file. ` +
            `See README-HOW.md#authoring-a-concern`,
        );
      }
    }

    concerns.push(parsed);
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

  if (ids.includes("well-engineered") && ids.includes("move-fast")) {
    tensions.push({
      between: ["well-engineered", "move-fast"],
      issue:
        "Engineering rigor vs shipping speed — which quality dimensions (tests, observability, security hardening) can be deferred to v2?",
    });
  }

  if (ids.includes("well-engineered") && ids.includes("learning-project")) {
    tensions.push({
      between: ["well-engineered", "learning-project"],
      issue:
        "Engineering standards vs experimentation freedom — how much test/security/observability rigor is appropriate for an experiment?",
    });
  }

  if (ids.includes("move-fast") && ids.includes("security-audited")) {
    tensions.push({
      between: ["move-fast", "security-audited"],
      issue:
        "Shipping speed vs security rigor — security audit phases add time; which phases can be parallelized vs which are blockers?",
    });
  }

  if (ids.includes("move-fast") && ids.includes("ship-ready")) {
    tensions.push({
      between: ["move-fast", "ship-ready"],
      issue:
        "Speed vs ship hygiene — ship-ready gates (coverage, CHANGELOG, version bump) add friction; each must be justified or automated.",
    });
  }

  if (ids.includes("move-fast") && ids.includes("peer-reviewed")) {
    tensions.push({
      between: ["move-fast", "peer-reviewed"],
      issue:
        "Shipping speed vs review thoroughness — Critical Pass items are non-negotiable blockers even under time pressure.",
    });
  }

  if (ids.includes("developer-experience") && ids.includes("compliance")) {
    tensions.push({
      between: ["developer-experience", "compliance"],
      issue:
        "Zero-friction DX vs mandatory compliance steps — required auth, data handling, or audit config adds onboarding friction that must be designed, not apologized for.",
    });
  }

  if (ids.includes("learning-project") && ids.includes("peer-reviewed")) {
    tensions.push({
      between: ["learning-project", "peer-reviewed"],
      issue:
        "Experimentation freedom vs review standards — experiments may intentionally violate best practices; reviewers must distinguish intentional experiments from accidental mistakes.",
    });
  }

  if (ids.includes("move-fast") && ids.includes("production-ready")) {
    tensions.push({
      between: ["move-fast", "production-ready"],
      issue:
        "Speed vs observability investment — structured logging, alerts, and canary criteria take time to set up but prevent much longer incidents later.",
    });
  }

  return tensions;
};

// =============================================================================
// Review Dimensions
// =============================================================================

export type TaggedReviewDimension = schema.ReviewDimension & {
  readonly concernId: string;
};

/** Collect review dimensions from active concerns, filtered by classification scope. */
export const getReviewDimensions = (
  activeConcerns: readonly schema.ConcernDefinition[],
  classification?: schema.SpecClassification | null,
): readonly TaggedReviewDimension[] => {
  const dimensions: TaggedReviewDimension[] = [];

  for (const concern of activeConcerns) {
    for (const dim of concern.reviewDimensions ?? []) {
      // Scope filter — if classification is null/undefined, include all (safe default)
      if (classification !== null && classification !== undefined) {
        if (dim.scope === "ui" && !classification.involvesWebUI) continue;
        if (dim.scope === "api" && !classification.involvesPublicAPI) continue;
        if (dim.scope === "data" && !classification.involvesDataHandling) {
          continue;
        }
      }

      dimensions.push({ ...dim, concernId: concern.id });
    }
  }

  return dimensions;
};

/** Collect all registry dimension IDs from active concerns. */
export const getRegistryDimensionIds = (
  activeConcerns: readonly schema.ConcernDefinition[],
): readonly string[] => {
  const ids: string[] = [];
  for (const concern of activeConcerns) {
    for (const reg of concern.registries ?? []) {
      if (!ids.includes(reg)) ids.push(reg);
    }
  }
  return ids;
};

/** Collect dream state prompts from active concerns. */
export const getDreamStatePrompts = (
  activeConcerns: readonly schema.ConcernDefinition[],
): readonly string[] => {
  return activeConcerns
    .filter((c) =>
      c.dreamStatePrompt !== undefined && c.dreamStatePrompt.length > 0
    )
    .map((c) => c.dreamStatePrompt!);
};
