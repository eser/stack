// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Codebase management utilities for workspace discovery, git operations,
 * and package configuration validation.
 *
 * @example
 * ```typescript
 * import * as codebase from "@eser/codebase";
 *
 * // Git operations
 * const commits = await codebase.getCommits("HEAD~5..HEAD");
 *
 * // Workspace discovery
 * const packages = await codebase.discoverPackages(".");
 * ```
 *
 * @module
 */

// Library APIs — safe to re-export (no name collisions)
export type { Commit, CommitUser } from "./git.ts";
export {
  checkout,
  checkoutPrevious,
  commit,
  createAndCheckoutBranch,
  createTag,
  getCommitsBetween,
  getCommitsSinceDate,
  getCurrentBranch,
  getLatestTag,
  push,
  pushTag,
  stageAll,
} from "./git.ts";

export type {
  ConfigFileType,
  FieldMapping,
  FieldOrigin,
  LoadOptions,
  PackageConfig,
  PackageFieldName,
  RawConfigFile,
  TrackedField,
  UpdateOptions,
  UpdateResult,
  WorkspaceModule,
} from "./package/mod.ts";
export {
  baseDirProp,
  CONFIG_FILE_PRIORITY,
  ConfigFileTypes,
  DEFAULT_FIELD_MAPPINGS,
  getBaseDir,
  getFilesWithField,
  getModule,
  getUpdateTargets,
  getWorkspaceModules,
  load,
  loadPackageConfig,
  PackageLoadError,
  PackageUpdateError,
  syncField,
  tryLoad,
  updateField,
  updateFields,
  updateVersion,
} from "./package/mod.ts";

export type { DiscoveredPackage } from "./workspace-discovery.ts";
export {
  discoverPackages,
  extractEntrypoints,
  getPackageFiles,
  getWorkspace,
  resolveModulePath,
} from "./workspace-discovery.ts";

export type {
  DirectiveAnalysisOptions,
  DirectiveMatch,
  DirectiveName,
} from "./directive-analysis.ts";
export {
  analyzeClientComponents,
  analyzeDirectives,
  analyzeServerActions,
  containsDirective,
  DIRECTIVES,
  extractExports,
  hasDirective,
} from "./directive-analysis.ts";

// CLI scripts are accessed via their own entry points in deno.json exports,
// not through this barrel. Each exports a `main` function which would collide.
// Import directly: @eser/codebase/check-circular-deps, @eser/codebase/versions, etc.
