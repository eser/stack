// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @eser/shell - Shell utilities for CLI applications
 *
 * Provides three submodules:
 * - `@eser/shell/completions` - Shell completion script generators (bash, zsh, fish)
 * - `@eser/shell/args` - Cobra-like CLI framework with command trees
 * - `@eser/shell/exec` - dax-like shell command execution
 *
 * @module
 */

export * as completions from "./completions/mod.ts";
export * as args from "./args/mod.ts";
export * as exec from "./exec/mod.ts";
