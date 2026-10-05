// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Variable processor for recipe templates.
 *
 * Handles Go template syntax substitution: {{.variable_name}}
 * Variables are resolved from: CLI flags → defaults.
 *
 * @module
 */

import type { TemplateVariable } from "./registry-schema.ts";

// =============================================================================
// Errors
// =============================================================================

/**
 * Thrown when a variable has no value from the caller and no default, and
 * interactive prompting is off.
 */
export class MissingVariableError extends Error {
  /**
   * Creates the error for a variable that has no value.
   *
   * @param variableName - The variable that has no value
   */
  constructor(variableName: string) {
    super(
      `Required variable '${variableName}' has no value and no default`,
    );
    this.name = "MissingVariableError";
  }
}

// =============================================================================
// Variable Validation
// =============================================================================

/**
 * Validate a variable value against its optional regex pattern.
 */
export const validateVariable = (
  variable: TemplateVariable,
  value: string,
): { ok: true } | { ok: false; reason: string } => {
  if (variable.pattern === undefined) {
    return { ok: true };
  }

  const regex = new RegExp(variable.pattern);
  if (!regex.test(value)) {
    return {
      ok: false,
      reason: `value "${value}" does not match pattern ${variable.pattern}`,
    };
  }

  return { ok: true };
};

// =============================================================================
// Interactive Prompt
// =============================================================================

/**
 * Interactively prompt for a single variable value.
 * Loops until the entered value passes regex validation (if any). An empty
 * answer takes the default; without a default it asks again.
 *
 * @throws {MissingVariableError} When the prompt gets no answer (stdin is not
 *   a terminal, or the input was cancelled) and the variable has no default.
 */
export const promptVariable = (variable: TemplateVariable): string => {
  const description = variable.description ?? variable.name;
  const defaultHint = variable.default !== undefined
    ? ` [${variable.default}]`
    : "";

  while (true) {
    const promptText = `${description}${defaultHint}: `;
    const raw = globalThis.prompt(promptText);

    if (raw === null && variable.default === undefined) {
      // prompt() answers null when stdin is not a terminal or the input was
      // cancelled, so asking again would loop forever.
      throw new MissingVariableError(variable.name);
    }

    if (raw === null || raw === "") {
      if (variable.default !== undefined) {
        return variable.default;
      }
      // Keep prompting until we get a value
      continue;
    }

    const validation = validateVariable(variable, raw);
    if (validation.ok === false) {
      // The prompt loop talks to the person at the terminal on stderr.
      // deno-lint-ignore no-console
      console.error(`  Error: ${validation.reason}. Try again.`);
      continue;
    }

    return raw;
  }
};

// =============================================================================
// Variable Resolution
// =============================================================================

/** Options for {@link resolveVariables}. */
export type ResolveVariablesOptions = {
  /** Prompt for missing variables (only effective when stdin is a TTY). */
  readonly interactive?: boolean;
};

const collectVariables = (
  definitions: readonly TemplateVariable[] | undefined,
  overrides: Readonly<Record<string, string>>,
  options: ResolveVariablesOptions,
): Record<string, string> => {
  if (definitions === undefined || definitions.length === 0) {
    // No declared variables → nothing to resolve. Overrides that don't map to a
    // declared variable are ignored (consistent with the loop below, which only
    // emits values for declared variables).
    return {};
  }

  const { interactive = false } = options;
  const resolved: Record<string, string> = {};

  for (const def of definitions) {
    const override = overrides[def.name];

    if (override !== undefined) {
      // Override provided — validate it if a pattern is set
      const validation = validateVariable(def, override);
      if (validation.ok === false) {
        throw new Error(
          `Variable '${def.name}': ${validation.reason}`,
        );
      }
      resolved[def.name] = override;
      continue;
    }

    if (def.default !== undefined) {
      resolved[def.name] = def.default;
      continue;
    }

    if (interactive) {
      resolved[def.name] = promptVariable(def);
      continue;
    }

    throw new MissingVariableError(def.name);
  }

  return resolved;
};

/**
 * Resolve variable values from provided overrides and definitions.
 * Priority: overrides (CLI flags) → defaults → (if interactive) prompt → throw.
 *
 * Accepts `undefined` for `definitions` (when recipe has no variables section).
 */
export const resolveVariables = (
  definitions: readonly TemplateVariable[] | undefined,
  overrides: Readonly<Record<string, string>>,
  options: ResolveVariablesOptions = {},
): Promise<Record<string, string>> => {
  // Resolution itself is synchronous, since promptVariable blocks on
  // globalThis.prompt. The executor turns a thrown error into a rejection, so
  // callers keep the promise-based contract.
  return new Promise((resolve) => {
    resolve(collectVariables(definitions, overrides, options));
  });
};

// =============================================================================
// Template Substitution
// =============================================================================

/**
 * Substitute Go template variables in text content.
 * Replaces `{{.variable_name}}` with the resolved value.
 * Whitespace-tolerant: `{{ .variable_name }}` also works.
 */
export const substituteVariables = (
  content: string,
  variables: Readonly<Record<string, string>>,
): string => {
  return content.replace(
    /\{\{\s*\.(\w+)\s*\}\}/g,
    (match, name: string) => {
      if (name in variables) {
        return variables[name]!;
      }
      // Leave unresolved variables as-is (they may be intended for a different processor)
      return match;
    },
  );
};

/**
 * Check if content contains any Go template variables.
 */
export const hasVariables = (content: string): boolean => {
  return /\{\{\s*\.\w+\s*\}\}/.test(content);
};
