// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dependency resolver — detects the project type (Go, Deno, Node),
 * generates dependency installation commands, and executes them.
 *
 * @module
 */

import * as registrySchema from "./registry-schema.ts";

// =============================================================================
// Types
// =============================================================================

type ProjectType = "go" | "deno" | "node" | "unknown";

interface ProjectDetection {
  readonly type: ProjectType;
  readonly configFile: string | undefined;
}

interface DependencyInstructions {
  readonly instructions: readonly string[];
  readonly warnings: readonly string[];
}

// =============================================================================
// Project detection
// =============================================================================

const PROJECT_FILES: ReadonlyArray<readonly [string, ProjectType]> = [
  ["go.mod", "go"],
  ["deno.json", "deno"],
  ["deno.jsonc", "deno"],
  ["package.json", "node"],
];

/**
 * Detect the project type by looking for config files in the given directory.
 */
const detectProjectType = async (
  cwd: string,
): Promise<ProjectDetection> => {
  for (const [filename, type] of PROJECT_FILES) {
    try {
      await Deno.stat(`${cwd}/${filename}`);
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
const getDependencyInstructions = (
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
    const isMatch = (recipeLanguage === "go" && projectType === "go") ||
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

interface InstallResult {
  readonly command: string;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Execute dependency installation commands in the given directory.
 * Runs each command sequentially, stops on first failure.
 * In dry-run mode, returns the commands without executing.
 */
const installDependencies = async (
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
      // deno-lint-ignore no-console
      console.log(`  [install] ${instruction}`);
    }

    const parts = instruction.split(/\s+/);
    const cmd = parts[0]!;
    const args = parts.slice(1);

    try {
      const command = new Deno.Command(cmd, {
        args,
        cwd,
        stdout: "inherit",
        stderr: "inherit",
      });

      const output = await command.output();

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

export {
  detectProjectType,
  getDependencyInstructions,
  installDependencies,
  PROJECT_FILES,
};

export type {
  DependencyInstructions,
  InstallResult,
  ProjectDetection,
  ProjectType,
};
