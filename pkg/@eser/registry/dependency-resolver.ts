// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dependency resolver — detects the project type (Go, Deno, Node) and
 * generates human-readable dependency installation instructions.
 *
 * Phase 1: prints instructions only (does NOT auto-install).
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

export { detectProjectType, getDependencyInstructions, PROJECT_FILES };

export type { DependencyInstructions, ProjectDetection, ProjectType };
