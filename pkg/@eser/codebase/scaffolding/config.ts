// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Template configuration loading and variable resolution
 *
 * @module
 */

import * as path from "@std/path";
import * as yaml from "@std/yaml";
import { runtime } from "@eser/standards/runtime";
import type { TemplateConfig, TemplateVariable } from "./types.ts";

/** Default config filenames to look for */
const CONFIG_FILENAMES = [".eser.yml", ".eser.yaml"];

/**
 * Load template configuration from a directory
 *
 * @param dir - Directory containing the template
 * @returns Template configuration or null if no config file exists
 */
export const loadTemplateConfig = async (
  dir: string,
): Promise<TemplateConfig | null> => {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = path.join(dir, filename);

    try {
      const content = await runtime.fs.readTextFile(filepath);
      const config = yaml.parse(content) as TemplateConfig;

      // Validate required fields
      if (typeof config.name !== "string" || config.name === "") {
        throw new Error(
          `Template config missing required 'name' field: ${filepath}`,
        );
      }

      return config;
    } catch (error) {
      // File doesn't exist or can't be read - try next filename
      if (error instanceof Deno.errors.NotFound) {
        continue;
      }
      throw error;
    }
  }

  return null;
};

/**
 * Prompt for a single variable value (interactive mode)
 */
const promptVariable = (
  variable: TemplateVariable,
): string | null => {
  const description = variable.description ?? variable.name;
  const defaultHint = variable.default !== undefined
    ? ` [${variable.default}]`
    : "";
  const requiredHint = variable.required === true ? " (required)" : "";

  const promptText = `${description}${requiredHint}${defaultHint}: `;

  // Use built-in prompt for interactive input
  const value = globalThis.prompt(promptText);

  if (value === null || value === "") {
    return variable.default ?? null;
  }

  return value;
};

/**
 * Validate a variable value against its pattern
 *
 * @returns Error message or null if valid
 */
const validateVariable = (
  variable: TemplateVariable,
  value: string,
): string | null => {
  if (variable.pattern === undefined) {
    return null;
  }

  const regex = new RegExp(variable.pattern);
  if (!regex.test(value)) {
    return `Value '${value}' does not match pattern '${variable.pattern}'`;
  }

  return null;
};

export type ResolveVariablesOptions = {
  /** Provided variable values */
  provided: Record<string, string>;
  /** Whether to prompt for missing variables */
  interactive: boolean;
};

/**
 * Resolve all template variables, prompting for missing ones if interactive
 *
 * @param config - Template configuration
 * @param options - Resolution options
 * @returns Resolved variable values
 * @throws Error if required variables are missing and not interactive
 */
export const resolveVariables = (
  config: TemplateConfig,
  options: ResolveVariablesOptions,
): Record<string, string> => {
  const { provided, interactive } = options;
  const variables = config.variables ?? [];
  const resolved: Record<string, string> = { ...provided };
  const errors: string[] = [];

  for (const variable of variables) {
    const { name, required, default: defaultValue } = variable;

    // Check if already provided
    if (resolved[name] !== undefined) {
      // Validate if pattern exists
      const validationError = validateVariable(variable, resolved[name]!);
      if (validationError !== null) {
        errors.push(`${name}: ${validationError}`);
      }
      continue;
    }

    // Try to prompt in interactive mode
    if (interactive) {
      const value = promptVariable(variable);

      if (value !== null) {
        const validationError = validateVariable(variable, value);
        if (validationError !== null) {
          errors.push(`${name}: ${validationError}`);
        } else {
          resolved[name] = value;
        }
        continue;
      }
    }

    // Use default value if available
    if (defaultValue !== undefined) {
      resolved[name] = defaultValue;
      continue;
    }

    // Required variable is missing
    if (required === true) {
      errors.push(`Missing required variable: ${name}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Variable resolution failed:\n${errors.join("\n")}`);
  }

  return resolved;
};

/**
 * Get the config file path in a directory (for cleanup)
 */
export const getConfigFilePath = async (
  dir: string,
): Promise<string | null> => {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = path.join(dir, filename);

    try {
      await runtime.fs.stat(filepath);
      return filepath;
    } catch {
      continue;
    }
  }

  return null;
};
