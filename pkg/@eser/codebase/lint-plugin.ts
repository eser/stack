// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Custom lint plugin for Deno.
 *
 * Provides custom lint rules for code quality and style enforcement.
 *
 * Rules:
 * - copyright-header: Enforces copyright header format
 * - no-top-level-arrow-exports: Prefers function declarations for exports
 * - prefer-private-fields: Prefers #privateField over private keyword
 *
 * Usage in deno.json:
 * ```json
 * {
 *   "lint": {
 *     "plugins": ["jsr:@eser/codebase/lint-plugin"]
 *   }
 * }
 * ```
 *
 * @module
 */

/**
 * Expected copyright header pattern.
 */
const COPYRIGHT_PATTERN =
  /^\/\/ Copyright [0-9]{4}-present Eser Ozvataf and other contributors\. All rights reserved\. [0-9A-Za-z\-.]+? license\.\n/;

/**
 * Arrow function export pattern.
 */
const ARROW_EXPORT_PATTERN =
  /^export const (\w+) = (?:async )?(?:\([^)]*\)|[a-z_]\w*) =>/;

/**
 * Private keyword pattern.
 */
const PRIVATE_KEYWORD_PATTERN = /\bprivate\s+(\w+)/;

/**
 * Lint rule for copyright header.
 */
export const copyrightHeaderRule = {
  name: "copyright-header",
  description: "Enforces correct copyright header format",
  validate: (
    source: string,
    _filename: string,
  ): { message: string; line: number }[] => {
    const errors: { message: string; line: number }[] = [];

    if (!COPYRIGHT_PATTERN.test(source)) {
      errors.push({
        message:
          "File must start with copyright header: // Copyright YYYY-present Eser Ozvataf and other contributors. All rights reserved. LICENSE license.",
        line: 1,
      });
    }

    return errors;
  },
};

/**
 * Lint rule for top-level arrow exports.
 */
export const noTopLevelArrowExportsRule = {
  name: "no-top-level-arrow-exports",
  description: "Prefers function declarations for top-level exports",
  validate: (
    source: string,
    _filename: string,
  ): { message: string; line: number }[] => {
    const errors: { message: string; line: number }[] = [];
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) {
        continue;
      }
      const match = line.match(ARROW_EXPORT_PATTERN);

      if (match !== null && match[1] !== undefined) {
        errors.push({
          message: `Prefer \`export function ${
            match[1]
          }\` over \`export const ${match[1]} =>\``,
          line: i + 1,
        });
      }
    }

    return errors;
  },
};

/**
 * Lint rule for private fields.
 */
export const preferPrivateFieldsRule = {
  name: "prefer-private-fields",
  description: "Prefers #privateField over private keyword in classes",
  validate: (
    source: string,
    _filename: string,
  ): { message: string; line: number }[] => {
    const errors: { message: string; line: number }[] = [];
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) {
        continue;
      }
      const match = line.match(PRIVATE_KEYWORD_PATTERN);

      if (match !== null && match[1] !== undefined) {
        errors.push({
          message: `Prefer \`#${match[1]}\` over \`private ${match[1]}\``,
          line: i + 1,
        });
      }
    }

    return errors;
  },
};

/**
 * Lint rule definition type.
 */
export type LintRule = {
  name: string;
  description: string;
  validate: (
    source: string,
    filename: string,
  ) => Array<{ message: string; line: number }>;
};

/**
 * Lint plugin type.
 */
export type LintPlugin = {
  name: string;
  rules: Record<string, LintRule>;
};

/**
 * All lint rules.
 */
export const rules: Array<LintRule> = [
  copyrightHeaderRule,
  noTopLevelArrowExportsRule,
  preferPrivateFieldsRule,
];

/**
 * Lint plugin configuration.
 *
 * This export is used by Deno's lint plugin system.
 */
const plugin: LintPlugin = {
  name: "eser-codebase",
  rules: Object.fromEntries(rules.map((r) => [r.name, r])),
};

export default plugin;
