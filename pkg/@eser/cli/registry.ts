// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Command registry for dispatchable library modules.
 *
 * Each entry maps a CLI path (e.g., `eser codebase versions`) to a lazy-loaded
 * library module that exports a `main()` function. Lambda-based loaders give
 * esbuild statically analyzable import expressions for bundling.
 *
 * @module
 */

import { type CliResult } from "@eser/shell/args";

/**
 * A module that can be dispatched from the CLI.
 */
export type DispatchableModule = {
  readonly main: (
    cliArgs?: readonly string[],
  ) => Promise<CliResult<void>>;
};

/**
 * Registry entry for a single module.
 */
export type ModuleEntry = {
  readonly description: string;
  readonly load: () => Promise<DispatchableModule>;
};

/**
 * Registry entry for a package namespace.
 */
export type PackageEntry = {
  readonly description: string;
  readonly modules: Record<string, ModuleEntry>;
  readonly aliases?: Record<string, string>;
};

/**
 * Static registry of dispatchable packages and modules.
 */
export const registry: Record<string, PackageEntry> = {
  codebase: {
    description: "Codebase management tools",
    modules: {
      versions: {
        description: "Manage workspace package versions",
        load: () => import("@eser/codebase/versions"),
      },
      validation: {
        description: "Run codebase validations",
        load: () => import("@eser/codebase/validation"),
      },
      scaffolding: {
        description: "Initialize project from template",
        load: () => import("@eser/codebase/scaffolding"),
      },
      "release-notes": {
        description: "Sync changelog to GitHub Releases",
        load: () => import("@eser/codebase/release-notes"),
      },
      "release-tag": {
        description: "Create and push release git tags",
        load: () => import("@eser/codebase/release-tag"),
      },
      "check-docs": {
        description: "Validate JSDoc documentation",
        load: () => import("@eser/codebase/check-docs"),
      },
      "check-circular-deps": {
        description: "Detect circular dependencies",
        load: () => import("@eser/codebase/check-circular-deps"),
      },
      "check-export-names": {
        description: "Validate export naming conventions",
        load: () => import("@eser/codebase/check-export-names"),
      },
      "check-licenses": {
        description: "Validate license headers",
        load: () => import("@eser/codebase/check-licenses"),
      },
      "check-mod-exports": {
        description: "Validate mod.ts export coverage",
        load: () => import("@eser/codebase/check-mod-exports"),
      },
      "check-package-configs": {
        description: "Validate package configurations",
        load: () => import("@eser/codebase/check-package-configs"),
      },
    },
    aliases: {
      validate: "validation",
      init: "scaffolding",
    },
  },
};
