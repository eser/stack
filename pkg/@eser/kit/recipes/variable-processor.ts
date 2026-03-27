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
// Variable Resolution
// =============================================================================

/**
 * Resolve variable values from provided overrides and definitions.
 * Priority: overrides (CLI flags) → definition defaults.
 * Throws MissingVariableError if a variable has no value and no default.
 */
const resolveVariables = (
  definitions: readonly TemplateVariable[],
  overrides: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> => {
  const resolved: Record<string, string> = {};

  for (const def of definitions) {
    const value = overrides[def.name];

    if (value !== undefined) {
      resolved[def.name] = value;
    } else if (def.default !== undefined) {
      resolved[def.name] = def.default;
    } else {
      throw new MissingVariableError(def.name);
    }
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
  resolveVariables,
  substituteVariables,
};
