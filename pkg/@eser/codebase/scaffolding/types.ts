// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Types for scaffolding templates
 *
 * @module
 */

/**
 * Template variable definition
 */
export type TemplateVariable = {
  /** Variable name (used in {{.name}} placeholders) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Default value if not provided */
  default?: string;
  /** Whether the variable is required */
  required?: boolean;
  /** Regex pattern for validation */
  pattern?: string;
};

/**
 * Template configuration from .eser.yml
 */
export type TemplateConfig = {
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Variables that can be substituted in files */
  variables?: TemplateVariable[];
  /** Glob patterns for files to skip during processing */
  ignore?: string[];
  /** Commands to run after scaffolding */
  postInstall?: string[];
  // Future: Component registry for add/remove commands
  // components?: Record<string, ComponentCategory>;
};

/**
 * Options for the scaffold function
 */
export type ScaffoldOptions = {
  /** Template specifier (e.g., "owner/repo" or "github:owner/repo#ref") */
  specifier: string;
  /** Target directory for scaffolding */
  targetDir: string;
  /** Variable values to substitute */
  variables?: Record<string, string>;
  /** Overwrite existing files */
  force?: boolean;
  /** Skip post-install commands */
  skipPostInstall?: boolean;
  /** Prompt for missing required variables */
  interactive?: boolean;
};

/**
 * Result of scaffolding operation
 */
export type ScaffoldResult = {
  /** Template name from config */
  templateName: string;
  /** Directory where template was scaffolded */
  targetDir: string;
  /** Variables that were substituted */
  variables: Record<string, string>;
  /** Post-install commands that were run */
  postInstallCommands: string[];
};
