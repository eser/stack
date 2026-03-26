// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Codebase module definition for @eser/shell integration.
 *
 * @module
 */

import { Module } from "@eser/shell/module";

export const moduleDef: Module = new Module({
  description: "Codebase management tools",
  modules: {
    // Setup
    scaffolding: {
      description: "Initialize project from template",
      category: "Setup",
      load: () => import("./scaffolding/mod.ts"),
    },
    install: {
      description: "Install git hooks from .manifest.yml",
      category: "Setup",
      load: () => import("./install.ts"),
    },
    uninstall: {
      description: "Remove managed git hooks",
      category: "Setup",
      load: async () => {
        const mod = await import("./install.ts");
        return { main: mod.uninstallMain };
      },
    },
    status: {
      description: "Show git hook installation status",
      category: "Setup",
      load: async () => {
        const mod = await import("./install.ts");
        return { main: mod.statusMain };
      },
    },

    // AI-powered
    commitmsg: {
      description: "Generate commit message from git diff",
      category: "AI",
      load: () => import("./commitmsg.ts"),
    },

    // GitHub
    gh: {
      description: "GitHub operations (contributors, releases, tags)",
      category: "GitHub",
      load: () => import("./gh.ts"),
    },

    // Release
    versions: {
      description: "Manage workspace package versions",
      category: "Release",
      load: () => import("./versions.ts"),
    },
    "changelog-gen": {
      description: "Generate CHANGELOG from commits",
      category: "Release",
      load: () => import("./changelog-gen.ts"),
    },
    release: {
      description: "Create a release (bump, changelog, commit, push)",
      category: "Release",
      load: () => import("./release.ts"),
    },
    rerelease: {
      description: "Delete and recreate the current version tag",
      category: "Release",
      load: async () => {
        const mod = await import("./release.ts");
        return { main: mod.rereleaseMain };
      },
    },
    unrelease: {
      description: "Delete the current version tag",
      category: "Release",
      load: async () => {
        const mod = await import("./release.ts");
        return { main: mod.unreleaseMain };
      },
    },

    // Validation
    "validate-eof": {
      description: "Ensure files end with newline",
      category: "Validation",
      load: () => import("./validate-eof.ts"),
    },
    "validate-trailing-whitespace": {
      description: "Remove trailing whitespace",
      category: "Validation",
      load: () => import("./validate-trailing-whitespace.ts"),
    },
    "validate-bom": {
      description: "Remove UTF-8 byte order markers",
      category: "Validation",
      load: () => import("./validate-bom.ts"),
    },
    "validate-line-endings": {
      description: "Normalize line endings to LF",
      category: "Validation",
      load: () => import("./validate-line-endings.ts"),
    },
    "validate-large-files": {
      description: "Detect files exceeding size limit",
      category: "Validation",
      load: () => import("./validate-large-files.ts"),
    },
    "validate-case-conflict": {
      description: "Detect case-conflicting filenames",
      category: "Validation",
      load: () => import("./validate-case-conflict.ts"),
    },
    "validate-merge-conflict": {
      description: "Detect merge conflict markers",
      category: "Validation",
      load: () => import("./validate-merge-conflict.ts"),
    },
    "validate-json": {
      description: "Validate JSON syntax",
      category: "Validation",
      load: () => import("./validate-json.ts"),
    },
    "validate-toml": {
      description: "Validate TOML syntax",
      category: "Validation",
      load: () => import("./validate-toml.ts"),
    },
    "validate-yaml": {
      description: "Validate YAML syntax",
      category: "Validation",
      load: () => import("./validate-yaml.ts"),
    },
    "validate-symlinks": {
      description: "Detect broken symlinks",
      category: "Validation",
      load: () => import("./validate-symlinks.ts"),
    },
    "validate-shebangs": {
      description: "Validate shebang consistency",
      category: "Validation",
      load: () => import("./validate-shebangs.ts"),
    },
    "validate-secrets": {
      description: "Detect credentials and private keys",
      category: "Validation",
      load: () => import("./validate-secrets.ts"),
    },
    "validate-filenames": {
      description: "Enforce filename conventions",
      category: "Validation",
      load: () => import("./validate-filenames.ts"),
    },
    "validate-submodules": {
      description: "Detect git submodules",
      category: "Validation",
      load: () => import("./validate-submodules.ts"),
    },
    "validate-commit-msg": {
      description: "Validate conventional commit format",
      category: "Validation",
      load: () => import("./validate-commit-msg.ts"),
    },
    "validate-docs": {
      description: "Validate JSDoc documentation",
      category: "Validation",
      load: () => import("./validate-docs.ts"),
    },
    "validate-circular-deps": {
      description: "Detect circular dependencies",
      category: "Validation",
      load: () => import("./validate-circular-deps.ts"),
    },
    "validate-export-names": {
      description: "Validate export naming conventions",
      category: "Validation",
      load: () => import("./validate-export-names.ts"),
    },
    "validate-licenses": {
      description: "Validate license headers",
      category: "Validation",
      load: () => import("./validate-licenses.ts"),
    },
    "validate-mod-exports": {
      description: "Validate mod.ts export coverage",
      category: "Validation",
      load: () => import("./validate-mod-exports.ts"),
    },
    "validate-package-configs": {
      description: "Validate package configurations",
      category: "Validation",
      load: () => import("./validate-package-configs.ts"),
    },
  },
  aliases: {
    init: "scaffolding",
  },
});
