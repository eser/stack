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

import type { ModuleGroupOptions } from "@eser/shell/args";

/**
 * Static registry of dispatchable packages and modules.
 *
 * Uses ModuleGroupOptions from @eser/shell/args so the registry can be
 * passed directly to Command.moduleGroup() — no adapter layer needed.
 */
export const registry: Record<string, ModuleGroupOptions> = {
  kit: {
    description: "Kit — recipes, templates, project creation",
    modules: {
      add: {
        description: "Add a recipe to your project",
        category: "Distribution",
        load: () => import("./commands/add.ts"),
        flags: [
          {
            name: "registry",
            type: "string",
            description: "Custom registry URL",
          },
          {
            name: "dry-run",
            type: "boolean",
            description: "Preview without writing",
          },
          {
            name: "force",
            type: "boolean",
            description: "Overwrite existing files",
          },
          {
            name: "skip-existing",
            type: "boolean",
            description: "Skip existing files",
          },
          {
            name: "verbose",
            type: "boolean",
            description: "Show detailed output",
          },
          { name: "local", type: "boolean", description: "Use local registry" },
          {
            name: "no-install",
            type: "boolean",
            description: "Skip dependency installation",
          },
          {
            name: "var",
            type: "string",
            description: "Template variable (key=value)",
          },
        ],
      },
      list: {
        description: "Browse available recipes and templates",
        category: "Distribution",
        load: () => import("./commands/list.ts"),
        flags: [
          {
            name: "language",
            type: "string",
            description: "Filter by language",
          },
          {
            name: "scale",
            type: "string",
            description: "Filter by scale (project/structure/utility)",
          },
          { name: "tag", type: "string", description: "Filter by tag" },
          {
            name: "registry",
            type: "string",
            description: "Custom registry URL",
          },
          { name: "local", type: "boolean", description: "Use local registry" },
        ],
      },
      new: {
        description: "Create a new project from a template",
        category: "Distribution",
        load: () => import("./commands/new.ts"),
        flags: [
          { name: "name", type: "string", description: "Project name" },
          {
            name: "registry",
            type: "string",
            description: "Custom registry URL",
          },
          { name: "local", type: "boolean", description: "Use local registry" },
          {
            name: "var",
            type: "string",
            description: "Template variable (key=value)",
          },
        ],
      },
      clone: {
        description: "Clone a recipe from any GitHub repo",
        category: "Distribution",
        load: () => import("./commands/clone.ts"),
        flags: [
          {
            name: "recipe",
            type: "string",
            description: "Path to recipe.json in repo",
          },
          {
            name: "name",
            short: "p",
            type: "string",
            description: "Target directory",
          },
          {
            name: "force",
            type: "boolean",
            description: "Overwrite existing files",
          },
          {
            name: "dry-run",
            type: "boolean",
            description: "Preview without writing",
          },
          {
            name: "verbose",
            type: "boolean",
            description: "Show detailed output",
          },
          {
            name: "var",
            type: "string",
            description: "Template variable (key=value)",
          },
        ],
      },
      update: {
        description: "Re-fetch and update an applied recipe",
        category: "Distribution",
        load: () => import("./commands/update.ts"),
        flags: [
          {
            name: "registry",
            type: "string",
            description: "Custom registry URL",
          },
          {
            name: "dry-run",
            type: "boolean",
            description: "Preview without writing",
          },
          {
            name: "verbose",
            type: "boolean",
            description: "Show detailed output",
          },
          { name: "local", type: "boolean", description: "Use local registry" },
        ],
      },
    },
    aliases: {
      create: "new",
    },
  },
  workflows: {
    description: "Workflow engine — run tool pipelines",
    modules: {
      run: {
        description: "Run workflows by event or id",
        load: async () => {
          const [workflowsRun, codebaseValidation] = await Promise.all([
            import("@eser/workflows/run"),
            import("@eser/codebase/validation"),
          ]);

          const tools = codebaseValidation.getWorkflowTools();

          return {
            main: (args?: readonly string[]) =>
              workflowsRun.main(args, { tools }),
          };
        },
      },
      list: {
        description: "List available workflows and tools",
        load: async () => {
          const [workflowsList, codebaseValidation] = await Promise.all([
            import("@eser/workflows/list"),
            import("@eser/codebase/validation"),
          ]);
          const tools = codebaseValidation.getWorkflowTools();
          return {
            main: (args?: readonly string[]) =>
              workflowsList.main(args, { tools }),
          };
        },
      },
    },
  },
  codebase: {
    description: "Codebase management tools",
    modules: {
      // Setup
      scaffolding: {
        description: "Initialize project from template",
        category: "Setup",
        load: () => import("@eser/codebase/scaffolding"),
      },
      install: {
        description: "Install git hooks from .manifest.yml",
        category: "Setup",
        load: () => import("@eser/codebase/install"),
      },
      uninstall: {
        description: "Remove managed git hooks",
        category: "Setup",
        load: async () => {
          const mod = await import("@eser/codebase/install");
          return { main: mod.uninstallMain };
        },
      },
      status: {
        description: "Show git hook installation status",
        category: "Setup",
        load: async () => {
          const mod = await import("@eser/codebase/install");
          return { main: mod.statusMain };
        },
      },

      // GitHub
      gh: {
        description: "GitHub operations (contributors, releases, tags)",
        category: "GitHub",
        load: () => import("@eser/codebase/gh"),
      },

      // Release
      versions: {
        description: "Manage workspace package versions",
        category: "Release",
        load: () => import("@eser/codebase/versions"),
      },
      "changelog-gen": {
        description: "Generate CHANGELOG from commits",
        category: "Release",
        load: () => import("@eser/codebase/changelog-gen"),
      },
      release: {
        description: "Create a release (bump, changelog, commit, push)",
        category: "Release",
        load: () => import("@eser/codebase/release"),
      },
      rerelease: {
        description: "Delete and recreate the current version tag",
        category: "Release",
        load: async () => {
          const mod = await import("@eser/codebase/release");
          return { main: mod.rereleaseMain };
        },
      },
      unrelease: {
        description: "Delete the current version tag",
        category: "Release",
        load: async () => {
          const mod = await import("@eser/codebase/release");
          return { main: mod.unreleaseMain };
        },
      },

      // Validation
      "validate-eof": {
        description: "Ensure files end with newline",
        category: "Validation",
        load: () => import("@eser/codebase/validate-eof"),
      },
      "validate-trailing-whitespace": {
        description: "Remove trailing whitespace",
        category: "Validation",
        load: () => import("@eser/codebase/validate-trailing-whitespace"),
      },
      "validate-bom": {
        description: "Remove UTF-8 byte order markers",
        category: "Validation",
        load: () => import("@eser/codebase/validate-bom"),
      },
      "validate-line-endings": {
        description: "Normalize line endings to LF",
        category: "Validation",
        load: () => import("@eser/codebase/validate-line-endings"),
      },
      "validate-large-files": {
        description: "Detect files exceeding size limit",
        category: "Validation",
        load: () => import("@eser/codebase/validate-large-files"),
      },
      "validate-case-conflict": {
        description: "Detect case-conflicting filenames",
        category: "Validation",
        load: () => import("@eser/codebase/validate-case-conflict"),
      },
      "validate-merge-conflict": {
        description: "Detect merge conflict markers",
        category: "Validation",
        load: () => import("@eser/codebase/validate-merge-conflict"),
      },
      "validate-json": {
        description: "Validate JSON syntax",
        category: "Validation",
        load: () => import("@eser/codebase/validate-json"),
      },
      "validate-toml": {
        description: "Validate TOML syntax",
        category: "Validation",
        load: () => import("@eser/codebase/validate-toml"),
      },
      "validate-yaml": {
        description: "Validate YAML syntax",
        category: "Validation",
        load: () => import("@eser/codebase/validate-yaml"),
      },
      "validate-symlinks": {
        description: "Detect broken symlinks",
        category: "Validation",
        load: () => import("@eser/codebase/validate-symlinks"),
      },
      "validate-shebangs": {
        description: "Validate shebang consistency",
        category: "Validation",
        load: () => import("@eser/codebase/validate-shebangs"),
      },
      "validate-secrets": {
        description: "Detect credentials and private keys",
        category: "Validation",
        load: () => import("@eser/codebase/validate-secrets"),
      },
      "validate-filenames": {
        description: "Enforce filename conventions",
        category: "Validation",
        load: () => import("@eser/codebase/validate-filenames"),
      },
      "validate-submodules": {
        description: "Detect git submodules",
        category: "Validation",
        load: () => import("@eser/codebase/validate-submodules"),
      },
      "validate-commit-msg": {
        description: "Validate conventional commit format",
        category: "Validation",
        load: () => import("@eser/codebase/validate-commit-msg"),
      },
      "validate-docs": {
        description: "Validate JSDoc documentation",
        category: "Validation",
        load: () => import("@eser/codebase/validate-docs"),
      },
      "validate-circular-deps": {
        description: "Detect circular dependencies",
        category: "Validation",
        load: () => import("@eser/codebase/validate-circular-deps"),
      },
      "validate-export-names": {
        description: "Validate export naming conventions",
        category: "Validation",
        load: () => import("@eser/codebase/validate-export-names"),
      },
      "validate-licenses": {
        description: "Validate license headers",
        category: "Validation",
        load: () => import("@eser/codebase/validate-licenses"),
      },
      "validate-mod-exports": {
        description: "Validate mod.ts export coverage",
        category: "Validation",
        load: () => import("@eser/codebase/validate-mod-exports"),
      },
      "validate-package-configs": {
        description: "Validate package configurations",
        category: "Validation",
        load: () => import("@eser/codebase/validate-package-configs"),
      },
    },
    aliases: {
      init: "scaffolding",
    },
  },
};
