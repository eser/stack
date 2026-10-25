// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dependency resolver — detects the project type (Go, Deno, Node),
 * generates dependency installation commands, and executes them.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import type * as registrySchema from "./registry-schema.ts";

// =============================================================================
// Types
// =============================================================================

/** The kind of project, from the config file found in its directory. */
export type ProjectType = "go" | "deno" | "node" | "unknown";

/** The result of {@link detectProjectType}. */
export interface ProjectDetection {
  /** The project kind; `"unknown"` when no known config file was found. */
  readonly type: ProjectType;
  /** The config file that decided the kind, such as `go.mod`, or undefined. */
  readonly configFile: string | undefined;
}

/** The result of {@link getDependencyInstructions}. */
export interface DependencyInstructions {
  /**
   * Install commands such as `deno add jsr:@eserstack/fp@^4.1.0`: the Go
   * modules first, then JSR, then npm.
   */
  readonly instructions: readonly string[];
  /** Notes for the person running kit, such as a language mismatch. */
  readonly warnings: readonly string[];
}

// =============================================================================
// Project detection
// =============================================================================

/**
 * Config file names and the project kind each one marks, in the order
 * {@link detectProjectType} checks them; the first file found wins.
 */
export const PROJECT_FILES: ReadonlyArray<readonly [string, ProjectType]> = [
  ["go.mod", "go"],
  ["deno.json", "deno"],
  ["deno.jsonc", "deno"],
  ["package.json", "node"],
];

/**
 * Detect the project type by looking for config files in the given directory.
 */
export const detectProjectType = async (
  cwd: string,
): Promise<ProjectDetection> => {
  for (const [filename, type] of PROJECT_FILES) {
    try {
      // PROJECT_FILES is in priority order and the first match wins, so the
      // checks run one at a time and stop at the first file that exists.
      // deno-lint-ignore no-await-in-loop
      await runtime.fs.stat(`${cwd}/${filename}`);
      return { type, configFile: filename };
    } catch {
      // File doesn't exist, try next
    }
  }

  return { type: "unknown", configFile: undefined };
};

// =============================================================================
// Instruction generation
// =============================================================================

/**
 * Generate human-readable dependency installation instructions for a recipe.
 * Returns instructions to print and any warnings about language mismatch.
 */
export const getDependencyInstructions = (
  recipe: registrySchema.Recipe,
  project: ProjectDetection,
): DependencyInstructions => {
  const instructions: string[] = [];
  const warnings: string[] = [];
  const deps = recipe.dependencies;

  if (deps === undefined) {
    return { instructions, warnings };
  }

  // Check for language mismatch
  const recipeLanguage = recipe.language;
  const projectType = project.type;

  if (projectType !== "unknown") {
    const isMatch =
      (recipeLanguage === "go" && projectType === "go") ||
      (recipeLanguage === "typescript" &&
        (projectType === "deno" || projectType === "node")) ||
      (recipeLanguage === "javascript" &&
        (projectType === "deno" || projectType === "node"));

    if (!isMatch) {
      warnings.push(
        `Recipe '${recipe.name}' is for ${recipeLanguage}, but detected ${projectType} project (${project.configFile}).`,
      );
    }
  }

  // Go dependencies
  if (deps.go !== undefined && deps.go.length > 0) {
    for (const dep of deps.go) {
      instructions.push(`go get ${dep}`);
    }
  }

  // JSR dependencies (Deno)
  if (deps.jsr !== undefined && deps.jsr.length > 0) {
    for (const dep of deps.jsr) {
      instructions.push(`deno add ${dep}`);
    }
  }

  // npm dependencies
  if (deps.npm !== undefined && deps.npm.length > 0) {
    for (const dep of deps.npm) {
      instructions.push(`npm install ${dep}`);
    }
  }

  return { instructions, warnings };
};

// =============================================================================
// Dependency installation
// =============================================================================

/** The outcome of one command run by {@link installDependencies}. */
export interface InstallResult {
  /** The command line as it was given. */
  readonly command: string;
  /** Whether the command exited with code 0 (always true in a dry run). */
  readonly success: boolean;
  /** Why it failed: the exit code, or the error that kept it from starting. */
  readonly error?: string;
}

/**
 * Execute dependency installation commands in the given directory.
 * Runs each command sequentially, stops on first failure.
 * In dry-run mode, returns the commands without executing.
 */
export const installDependencies = async (
  instructions: readonly string[],
  cwd: string,
  options?: { dryRun?: boolean; verbose?: boolean },
): Promise<readonly InstallResult[]> => {
  const results: InstallResult[] = [];

  for (const instruction of instructions) {
    if (options?.dryRun === true) {
      results.push({ command: instruction, success: true });
      continue;
    }

    if (options?.verbose === true) {
      // Verbose install lines are kit's CLI output for the person running it.
      // deno-lint-ignore no-console
      console.log(`  [install] ${instruction}`);
    }

    const parts = instruction.split(/\s+/);
    const cmd = parts[0]!;
    const args = parts.slice(1);

    try {
      // Installers run one at a time: they write the same lockfile and
      // manifest, and the loop stops at the first failure.
      // deno-lint-ignore no-await-in-loop
      const output = await runtime.exec.spawn(cmd, args, {
        cwd,
        stdout: "inherit",
        stderr: "inherit",
      });

      if (!output.success) {
        results.push({
          command: instruction,
          success: false,
          error: `Exit code ${output.code}`,
        });
        break; // Stop on first failure
      }

      results.push({ command: instruction, success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({ command: instruction, success: false, error: msg });
      break;
    }
  }

  return results;
};
