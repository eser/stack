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

export * from "./git.ts";
export * from "./package/mod.ts";
export * from "./workspace-discovery.ts";
export * from "./check-circular-deps.ts";
export * from "./check-mod-exports.ts";
export * from "./check-export-names.ts";
export * from "./check-docs.ts";
export * from "./check-licenses.ts";
export * from "./check-package-configs.ts";
export * from "./versions.ts";
