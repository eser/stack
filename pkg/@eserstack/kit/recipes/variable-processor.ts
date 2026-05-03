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

class MissingVariableError extends Error {
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
const validateVariable = (
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
 * Loops until the entered value passes regex validation (if any).
 */
const promptVariable = async (variable: TemplateVariable): Promise<string> => {
  const description = variable.description ?? variable.name;
  const defaultHint = variable.default !== undefined
    ? ` [${variable.default}]`
    : "";

  while (true) {
    const promptText = `${description}${defaultHint}: `;
    const raw = globalThis.prompt(promptText);

    if (raw === null || raw === "") {
      if (variable.default !== undefined) {
        return variable.default;
      }
      // Keep prompting until we get a value
      continue;
    }

    const validation = validateVariable(variable, raw);
    if (validation.ok === false) {
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

type ResolveVariablesOptions = {
  /** Prompt for missing variables (only effective when stdin is a TTY). */
  readonly interactive?: boolean;
};

/**
 * Resolve variable values from provided overrides and definitions.
 * Priority: overrides (CLI flags) → defaults → (if interactive) prompt → throw.
 *
 * Accepts `undefined` for `definitions` (when recipe has no variables section).
 */
const resolveVariables = async (
  definitions: readonly TemplateVariable[] | undefined,
  overrides: Readonly<Record<string, string>>,
  options: ResolveVariablesOptions = {},
): Promise<Record<string, string>> => {
  if (definitions === undefined || definitions.length === 0) {
    return { ...overrides };
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
      resolved[def.name] = await promptVariable(def);
      continue;
    }

    throw new MissingVariableError(def.name);
  }

  return resolved;
};

// =============================================================================
// Template Substitution
// =============================================================================

/**
 * Substitute Go template variables in text content.
 * Replaces `{{.variable_name}}` with the resolved value.
 * Whitespace-tolerant: `{{ .variable_name }}` also works.
 */
const substituteVariables = (
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
const hasVariables = (content: string): boolean => {
  return /\{\{\s*\.\w+\s*\}\}/.test(content);
};

export {
  hasVariables,
  MissingVariableError,
  promptVariable,
  resolveVariables,
  substituteVariables,
  validateVariable,
};

export type { ResolveVariablesOptions };
