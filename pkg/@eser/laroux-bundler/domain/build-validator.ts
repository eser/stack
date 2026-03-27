// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Build Isolation Validator
 *
 * Ensures the build process only writes to the designated output directory (dist/).
 * This is critical for:
 * - Docker/container deployments with read-only source volumes
 * - Deno permission scoping (--allow-write=dist/)
 * - CI/CD pipelines (clean git status after build)
 * - Build reproducibility
 */

import { runtime } from "@eser/standards/cross-runtime";
import { walkFiles } from "@eser/collector";
import { copy, ensureDir } from "@std/fs"; // copy not available in runtime
import * as logging from "@eser/logging";

// Pattern to ignore node_modules and hidden directories
const IGNORE_PATTERN = /(?:node_modules|\/\.|\\\.)/;

const validatorLogger = logging.logger.getLogger([
  "laroux-bundler",
  "build-validator",
]);

export interface BuildIsolationReport {
  valid: boolean;
  violations: FileViolation[];
  checkedAt: Date;
  distDir: string;
  projectRoot: string;
}

export interface FileViolation {
  filePath: string;
  relativePath: string;
  type: "created" | "modified";
  timestamp: Date;
}

/**
 * Files that are intentionally generated in src/ (grandfathered but should be migrated)
 * These generate warnings but don't fail the build
 */
const KNOWN_SRC_ARTIFACTS = [
  "_generated.ts", // Route generation (to be moved to dist/)
  ".module.css.json", // CSS module mappings (to be moved to dist/)
  ".module.css.d.ts", // CSS module TypeScript definitions
];

/**
 * Directories that should never have build artifacts
 */
const PROTECTED_DIRECTORIES = ["src", "public", "packages"];

/**
 * Validate that the build only wrote to the output directory
 *
 * @param projectRoot - The project root directory
 * @param distDir - The designated output directory
 * @param buildStartTime - Timestamp when the build started
 * @param options - Validation options
 * @returns Validation report
 */
export async function validateBuildIsolation(
  projectRoot: string,
  distDir: string,
  buildStartTime: Date,
  options: {
    strict?: boolean; // Fail on any violation
    warnOnly?: boolean; // Only warn, don't fail
    ignorePatterns?: string[]; // Additional patterns to ignore
  } = {},
): Promise<BuildIsolationReport> {
  const violations: FileViolation[] = [];
  const resolvedDistDir = runtime.path.resolve(projectRoot, distDir);

  validatorLogger.debug("Validating build isolation...");
  validatorLogger.debug(`  Project root: ${projectRoot}`);
  validatorLogger.debug(`  Dist dir: ${resolvedDistDir}`);
  validatorLogger.debug(`  Build start: ${buildStartTime.toISOString()}`);

  // Check each protected directory for modifications
  for (const protectedDir of PROTECTED_DIRECTORIES) {
    const dirPath = runtime.path.resolve(projectRoot, protectedDir);

    if (!(await runtime.fs.exists(dirPath))) {
      continue;
    }

    await scanForViolations(
      dirPath,
      projectRoot,
      buildStartTime,
      violations,
      options.ignorePatterns ?? [],
    );
  }

  const report: BuildIsolationReport = {
    valid: violations.length === 0,
    violations,
    checkedAt: new Date(),
    distDir: resolvedDistDir,
    projectRoot,
  };

  // Log results
  if (violations.length === 0) {
    validatorLogger.debug("Build isolation validated successfully");
  } else {
    const level = options.strict ? "error" : "warn";

    validatorLogger[level](
      `Build isolation violations detected: ${violations.length} file(s) modified outside dist/`,
    );

    for (const violation of violations) {
      const isKnown = KNOWN_SRC_ARTIFACTS.some((artifact) =>
        violation.relativePath.includes(artifact)
      );

      if (isKnown) {
        validatorLogger.warn(
          `  Known artifact: ${violation.relativePath} (${violation.type})`,
        );
      } else {
        validatorLogger[level](
          `  VIOLATION: ${violation.relativePath} (${violation.type})`,
        );
      }
    }

    if (options.strict && !options.warnOnly) {
      throw new Error(
        `Build isolation failed: ${violations.length} file(s) modified outside dist/. ` +
          `Use --no-strict to allow or fix the build to only write to dist/.`,
      );
    }
  }

  return report;
}

/**
 * Scan a directory for files modified after the build start time
 */
async function scanForViolations(
  dirPath: string,
  projectRoot: string,
  buildStartTime: Date,
  violations: FileViolation[],
  ignorePatterns: string[],
): Promise<void> {
  try {
    for await (const relPath of walkFiles(dirPath, undefined, IGNORE_PATTERN)) {
      const filePath = runtime.path.join(dirPath, relPath);

      // Check if file matches ignore patterns
      const relativePath = runtime.path.relative(projectRoot, filePath);
      if (ignorePatterns.some((pattern) => relativePath.includes(pattern))) {
        continue;
      }

      try {
        const stat = await runtime.fs.stat(filePath);

        if (stat.mtime && stat.mtime > buildStartTime) {
          violations.push({
            filePath,
            relativePath,
            type: "modified",
            timestamp: stat.mtime,
          });
        }
      } catch {
        // File may have been deleted, skip
      }
    }
  } catch (error) {
    validatorLogger.debug(`Could not scan ${dirPath}:`, { error });
  }
}

/**
 * Check if a path is within the allowed output directory
 */
export function isWithinOutputDir(
  filePath: string,
  distDir: string,
): boolean {
  const resolvedFilePath = runtime.path.resolve(filePath);
  const resolvedDistDir = runtime.path.resolve(distDir);

  return resolvedFilePath.startsWith(resolvedDistDir + runtime.path.sep) ||
    resolvedFilePath === resolvedDistDir;
}

/**
 * Isolated writer interface for build output
 */
export type IsolatedWriter = {
  writeTextFile(filePath: string, content: string): Promise<void>;
  copy(src: string, dest: string): Promise<void>;
};

/**
 * Create a safe write function that only allows writes to dist/
 * Use this to wrap file writes for strict isolation
 */
export function createIsolatedWriter(distDir: string): IsolatedWriter {
  const resolvedDistDir = runtime.path.resolve(distDir);

  return {
    async writeTextFile(filePath: string, content: string): Promise<void> {
      if (!isWithinOutputDir(filePath, resolvedDistDir)) {
        throw new Error(
          `Build isolation violation: Cannot write to ${filePath} (outside ${resolvedDistDir})`,
        );
      }

      // Ensure directory exists
      await runtime.fs.ensureDir(runtime.path.dirname(filePath));
      await runtime.fs.writeTextFile(filePath, content);
    },

    async copy(src: string, dest: string): Promise<void> {
      if (!isWithinOutputDir(dest, resolvedDistDir)) {
        throw new Error(
          `Build isolation violation: Cannot copy to ${dest} (outside ${resolvedDistDir})`,
        );
      }

      await ensureDir(runtime.path.dirname(dest));
      await copy(src, dest, { overwrite: true });
    },
  };
}

/**
 * Clean up known build artifacts from src/ directory
 * Use before implementing full isolation to start fresh
 */
export async function cleanSrcArtifacts(
  projectRoot: string,
): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = [];
  const failed: string[] = [];

  const srcDir = runtime.path.resolve(projectRoot, "src");

  validatorLogger.debug("Cleaning build artifacts from src/...");

  try {
    for await (const relPath of walkFiles(srcDir, undefined, /node_modules/)) {
      const filePath = runtime.path.join(srcDir, relPath);
      const isArtifact = KNOWN_SRC_ARTIFACTS.some((pattern) =>
        filePath.endsWith(pattern)
      );

      if (isArtifact) {
        try {
          await runtime.fs.remove(filePath);
          deleted.push(runtime.path.relative(projectRoot, filePath));
          validatorLogger.debug(`  Deleted: ${filePath}`);
        } catch (error) {
          failed.push(runtime.path.relative(projectRoot, filePath));
          validatorLogger.warn(`  Failed to delete: ${filePath}`, { error });
        }
      }
    }
  } catch (error) {
    validatorLogger.error("Failed to scan src/ for artifacts", { error });
  }

  if (deleted.length > 0) {
    validatorLogger.debug(`Cleaned ${deleted.length} artifact(s) from src/`);
  }

  return { deleted, failed };
}
