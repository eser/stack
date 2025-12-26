// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Scaffolding module for creating projects from templates
 *
 * A degit-like system for downloading and processing templates from various sources.
 * Supports variable substitution using Go template syntax ({{.variable_name}}).
 *
 * @example
 * ```typescript
 * import { scaffold } from "@eser/codebase/scaffolding";
 *
 * await scaffold({
 *   specifier: "eser/ajan",  // GitHub repo
 *   targetDir: "./my-project",
 *   variables: { project_name: "my-app" },
 * });
 * ```
 *
 * @example
 * ```typescript
 * import { scaffold } from "@eser/codebase/scaffolding";
 *
 * // With explicit provider prefix
 * await scaffold({
 *   specifier: "gh:eser/ajan#v1.0.0",  // GitHub with version
 *   targetDir: "./my-project",
 *   interactive: true,  // Prompt for missing variables
 * });
 * ```
 *
 * @module
 */

// Main scaffold function
export { scaffold } from "./scaffold.ts";

// Types
export type {
  ScaffoldOptions,
  ScaffoldResult,
  TemplateConfig,
  TemplateVariable,
} from "./types.ts";

// Provider system
export {
  fetchTemplate,
  getDefaultProvider,
  getProvider,
  parseSpecifier,
  registerProvider,
} from "./providers/mod.ts";

export type {
  GitHubRef,
  ParsedSpecifier,
  Provider,
  ProviderRef,
} from "./providers/mod.ts";

// Config utilities
export { loadTemplateConfig, resolveVariables } from "./config.ts";

// Processing utilities
export { hasVariables, substituteVariables } from "./processor.ts";
