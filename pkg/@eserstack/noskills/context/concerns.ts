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
import * as concernScope from "../state/concern-scope.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// Library consumers read `ConcernDefinition.reminders`, whose entries are
// plain or scoped; these helpers read either shape.
export {
  CONCERN_SCOPES,
  reminderScope,
  reminderText,
} from "../state/concern-scope.ts";

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

  // Each concern is its own file, so they load concurrently; map keeps the
  // sorted order.
  return await Promise.all(entries.map(async (entry) => {
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

    const scopeProblem = concernScope.concernScopeProblem(parsed);
    if (scopeProblem !== null) {
      throw new Error(
        `Invalid concern at ${filePath}: ${scopeProblem}. ` +
          "See README-HOW.md#where-content-applies-scope",
      );
    }

    // Load promptFile content and append to reminders (relative to concern's own dir)
    if (parsed.promptFile !== undefined) {
      const concernDir = filePath.slice(0, filePath.lastIndexOf("/"));
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

    return parsed;
  }));
};

/**
 * Load built-in concerns. Embedded via static imports — works in all runtimes
 * including bundled npm packages where filesystem paths don't resolve.
 */
export const loadDefaultConcerns = (): Promise<
  readonly schema.ConcernDefinition[]
> => {
  return Promise.resolve(defaultConcerns.DEFAULT_CONCERNS);
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

/**
 * Every reminder of the active concerns, prefixed with its concern id. With a
 * classification, a scoped reminder is left out unless one of its scope
 * values has its flag set; without one (not classified yet), every reminder
 * is kept.
 */
export const getReminders = (
  concerns: readonly schema.ConcernDefinition[],
  classification?: schema.SpecClassification | null,
): readonly string[] => {
  const reminders: string[] = [];

  for (const concern of concerns) {
    for (const reminder of concern.reminders) {
      if (
        classification !== null && classification !== undefined &&
        !concernScope.scopeMatchesClassification(
          concernScope.reminderScope(reminder),
          classification,
        )
      ) {
        continue;
      }

      reminders.push(`${concern.id}: ${concernScope.reminderText(reminder)}`);
    }
  }

  return reminders;
};

/**
 * Splits reminders into tier1 (no scope: in the compiled EXECUTING
 * instruction) and tier2 (scoped: file-specific, added by the PreToolUse hook
 * through {@link getTier2RemindersForFile}). With a classification, tier2 keeps
 * only the scoped reminders whose scope matches it.
 */
export const splitRemindersByTier = (
  concerns: readonly schema.ConcernDefinition[],
  classification?: schema.SpecClassification | null,
): { tier1: readonly string[]; tier2: readonly string[] } => {
  const tier1: string[] = [];
  const tier2: string[] = [];

  for (const concern of concerns) {
    for (const reminder of concern.reminders) {
      const prefixed = `${concern.id}: ${concernScope.reminderText(reminder)}`;
      const scope = concernScope.reminderScope(reminder);

      if (scope.length === 0) {
        tier1.push(prefixed);
        continue;
      }

      if (
        classification === null || classification === undefined ||
        concernScope.scopeMatchesClassification(scope, classification)
      ) {
        tier2.push(prefixed);
      }
    }
  }

  return { tier1, tier2 };
};

/**
 * The tier2 (scoped) reminders that apply to an edit of `filePath`: "ui"
 * reminders for UI files, "api" reminders for source files, "data" and
 * "migration" reminders for any file, each only when the spec's
 * classification has the matching flag or is not known yet.
 */
export const getTier2RemindersForFile = (
  concerns: readonly schema.ConcernDefinition[],
  filePath: string,
  classification?: schema.SpecClassification | null,
): readonly string[] => {
  const reminders: string[] = [];

  for (const concern of concerns) {
    for (const reminder of concern.reminders) {
      if (
        concernScope.scopeMatchesFile(
          concernScope.reminderScope(reminder),
          filePath,
          classification ?? null,
        )
      ) {
        reminders.push(
          `${concern.id}: ${concernScope.reminderText(reminder)}`,
        );
      }
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
      // Scope filter — if classification is null/undefined, include all (safe default).
      // "all", and a value noskills does not know, keep the dimension.
      if (
        classification !== null && classification !== undefined &&
        concernScope.isConcernScope(dim.scope) &&
        !concernScope.scopeMatchesClassification([dim.scope], classification)
      ) {
        continue;
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
