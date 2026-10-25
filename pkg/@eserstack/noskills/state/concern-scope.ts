// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Where concern content applies.
 *
 * A concern's reminders and spec sections may declare a `scope`: a list of
 * {@link schema.ConcernScope} values, each naming one flag of the spec's
 * classification. Content without a scope applies to every spec. This module
 * reads those scopes against a classification and against the file an agent
 * edits, and checks the values a concern file declares. The Go mirror is
 * pkg/ajan/noskillsfx/concern_scope.go.
 *
 * @module
 */

import type * as schema from "./schema.ts";

/** Every scope value, in the order the docs list them. */
export const CONCERN_SCOPES: readonly schema.ConcernScope[] = [
  "ui",
  "api",
  "data",
  "migration",
];

type ClassificationFlag =
  | "involvesWebUI"
  | "involvesCLI"
  | "involvesPublicAPI"
  | "involvesMigration"
  | "involvesDataHandling";

/** The classification flag each scope value stands for. */
const SCOPE_FLAGS: Readonly<Record<schema.ConcernScope, ClassificationFlag>> = {
  ui: "involvesWebUI",
  api: "involvesPublicAPI",
  data: "involvesDataHandling",
  migration: "involvesMigration",
};

/** The flag names a legacy `condition` may hold. */
const CONDITION_FLAGS: readonly ClassificationFlag[] = [
  "involvesWebUI",
  "involvesCLI",
  "involvesPublicAPI",
  "involvesMigration",
  "involvesDataHandling",
];

/** Extensions of the files the hook adds "ui" reminders for. */
export const UI_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".tsx",
  ".jsx",
  ".html",
  ".css",
  ".svelte",
  ".vue",
]);

/** Extensions of the source files the hook adds "api" reminders for. */
export const SOURCE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".go",
  ".py",
  ".rs",
]);

/**
 * Which edited files each scope value's reminders are added for. "data" and
 * "migration" have no file type of their own, so they cover every file.
 */
const SCOPE_FILES: Readonly<
  Record<schema.ConcernScope, (extension: string) => boolean>
> = {
  ui: (extension) => UI_FILE_EXTENSIONS.has(extension),
  api: (extension) => SOURCE_FILE_EXTENSIONS.has(extension),
  data: () => true,
  migration: () => true,
};

/** Reports whether `value` is one of {@link CONCERN_SCOPES}. */
export const isConcernScope = (value: unknown): value is schema.ConcernScope =>
  typeof value === "string" &&
  (CONCERN_SCOPES as readonly string[]).includes(value);

/** The text of a reminder, whether it is plain or scoped. */
export const reminderText = (reminder: schema.ConcernReminder): string =>
  typeof reminder === "string" ? reminder : reminder.text;

/** The scope of a reminder; empty for a plain one, which applies everywhere. */
export const reminderScope = (
  reminder: schema.ConcernReminder,
): readonly schema.ConcernScope[] =>
  typeof reminder === "string" ? [] : (reminder.scope ?? []);

/**
 * Reports whether content with this scope applies to a spec with this
 * classification: an empty scope applies to every spec, otherwise one of its
 * values must have its classification flag set.
 */
export const scopeMatchesClassification = (
  scope: readonly schema.ConcernScope[],
  classification: schema.SpecClassification,
): boolean =>
  scope.length === 0 ||
  scope.some((value) => classification[SCOPE_FLAGS[value]] === true);

/** The extension of a path's last segment, with its dot, or "". */
const fileExtension = (filePath: string): string => {
  const nameStart =
    Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1;
  const dot = filePath.lastIndexOf(".");

  return dot > nameStart ? filePath.slice(dot) : "";
};

/**
 * Reports whether a reminder with this scope applies to an edit of
 * `filePath`: one scope value must cover the file and have its flag set in
 * the classification. A null classification (not known yet) matches every
 * value. An empty scope matches nothing, because a reminder without a scope
 * is in the compiled instruction instead.
 */
export const scopeMatchesFile = (
  scope: readonly schema.ConcernScope[],
  filePath: string,
  classification: schema.SpecClassification | null,
): boolean => {
  const extension = fileExtension(filePath);

  return scope.some(
    (value) =>
      SCOPE_FILES[value](extension) &&
      (classification === null || classification[SCOPE_FLAGS[value]] === true),
  );
};

/** A spec section with its scope and legacy condition read out. */
export type SectionApplicability = {
  readonly scope: readonly schema.ConcernScope[];
  readonly condition: string | null;
};

/** Reports whether a section waits for the classification before it shows. */
export const isConditionalSection = (section: SectionApplicability): boolean =>
  section.scope.length > 0 || section.condition !== null;

/**
 * Reports whether a section applies to a spec with this classification. Its
 * scope must match, and so must its legacy `condition` when it has one; a
 * condition that names no classification flag never matches.
 */
export const sectionMatchesClassification = (
  section: SectionApplicability,
  classification: schema.SpecClassification,
): boolean => {
  if (!scopeMatchesClassification(section.scope, classification)) {
    return false;
  }

  if (section.condition === null) {
    return true;
  }

  return (
    (CONDITION_FLAGS as readonly string[]).includes(section.condition) &&
    classification[section.condition as ClassificationFlag] === true
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value instanceof Object && !Array.isArray(value);

const EXPECTED_SCOPES = `expected a list of ${CONCERN_SCOPES.join(", ")}`;

/** Why a declared `scope` value is invalid, or null when it is valid. */
const scopeValueProblem = (where: string, scope: unknown): string | null => {
  if (scope === undefined) return null;
  if (!Array.isArray(scope)) {
    return `${where}.scope is ${JSON.stringify(scope)}; ${EXPECTED_SCOPES}`;
  }

  const unknown = scope.find((value) => !isConcernScope(value));

  return unknown === undefined
    ? null
    : `${where}.scope has ${JSON.stringify(unknown)}; ${EXPECTED_SCOPES}`;
};

/**
 * Why the scopes a concern declares are invalid, or null when they are all
 * valid. Checks every reminder (a string, or an object with a `text` string
 * and an optional `scope`) and every spec section's `scope`. Concern files
 * are user input, so loaders call this before the content is used.
 */
export const concernScopeProblem = (concern: unknown): string | null => {
  if (!isRecord(concern)) return "the concern must be a JSON object";

  const reminders = concern["reminders"];
  if (Array.isArray(reminders)) {
    for (const [index, reminder] of reminders.entries()) {
      const where = `reminders[${index}]`;
      if (typeof reminder === "string") continue;
      if (!isRecord(reminder) || typeof reminder["text"] !== "string") {
        return `${where} must be a string or an object with a "text" string`;
      }

      const problem = scopeValueProblem(where, reminder["scope"]);
      if (problem !== null) return problem;
    }
  }

  const sections = concern["specSections"];
  if (Array.isArray(sections)) {
    for (const [index, section] of sections.entries()) {
      if (!isRecord(section)) continue;

      const problem = scopeValueProblem(
        `specSections[${index}]`,
        section["scope"],
      );
      if (problem !== null) return problem;
    }
  }

  return null;
};
