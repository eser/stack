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

import { runtime } from "@eserstack/standards/cross-runtime";
import * as collector from "@eserstack/collector";
import * as fs from "@std/fs"; // copy not available in runtime
import * as logging from "@eserstack/logging";

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
 * The build wrote outside the output directory while strict validation was on.
 */
export class BuildIsolationError extends Error {
  readonly violations: readonly FileViolation[];

  // Explicit assignment, not parameter properties: Node's erase-only type
  // stripping cannot emit the assignment a parameter property implies.
  constructor(violations: readonly FileViolation[]) {
    super(
      `build isolation: ${violations.length} file(s) modified outside dist/: ${violations
        .map((violation) => `${violation.relativePath} (${violation.type})`)
        .join(
          ", ",
        )}. Fix the build to write only to dist/, or validate without strict.`,
    );
    this.name = "BuildIsolationError";
    this.violations = violations;
  }
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
  const resolvedDistDir = runtime.path.resolve(projectRoot, distDir);

  validatorLogger.debug("Validating build isolation...");
  validatorLogger.debug(`  Project root: ${projectRoot}`);
  validatorLogger.debug(`  Dist dir: ${resolvedDistDir}`);
  validatorLogger.debug(`  Build start: ${buildStartTime.toISOString()}`);

  // Check each protected directory for modifications; the scans are
  // independent and their results are joined in directory order
  const violationsPerDirectory = await Promise.all(
    PROTECTED_DIRECTORIES.map(async (protectedDir) => {
      const dirPath = runtime.path.resolve(projectRoot, protectedDir);

      if (!(await runtime.fs.exists(dirPath))) {
        return [];
      }

      return await scanForViolations(
        dirPath,
        projectRoot,
        buildStartTime,
        options.ignorePatterns ?? [],
      );
    }),
  );
  const violations = violationsPerDirectory.flat();

  const report: BuildIsolationReport = {
    valid: violations.length === 0,
    violations,
    checkedAt: new Date(),
    distDir: resolvedDistDir,
    projectRoot,
  };

  if (violations.length === 0) {
    validatorLogger.debug("Build isolation validated successfully");
    return report;
  }

  // A failing strict check throws, and the caller that handles the error logs
  // it; only the outcomes that do not throw are logged here
  if (options.strict === true && options.warnOnly !== true) {
    throw new BuildIsolationError(violations);
  }

  const level = options.strict === true ? "error" : "warn";

  validatorLogger[level](
    `Build isolation violations detected: ${violations.length} file(s) modified outside dist/`,
  );

  for (const violation of violations) {
    const isKnown = KNOWN_SRC_ARTIFACTS.some((artifact) =>
      violation.relativePath.includes(artifact),
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

  return report;
}

/**
 * Scan a directory for files modified after the build start time
 */
async function scanForViolations(
  dirPath: string,
  projectRoot: string,
  buildStartTime: Date,
  ignorePatterns: string[],
): Promise<FileViolation[]> {
  const violations: FileViolation[] = [];

  try {
    for await (const relPath of collector.walkFiles(
      dirPath,
      undefined,
      IGNORE_PATTERN,
    )) {
      const filePath = runtime.path.join(dirPath, relPath);

      // Check if file matches ignore patterns
      const relativePath = runtime.path.relative(projectRoot, filePath);
      if (ignorePatterns.some((pattern) => relativePath.includes(pattern))) {
        continue;
      }

      try {
        const stat = await runtime.fs.stat(filePath);

        if (stat.mtime !== null && stat.mtime > buildStartTime) {
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
    validatorLogger
      .with({ error })
      .debug(`scan ${dirPath} for files changed during the build; skipping it`);
  }

  return violations;
}

/**
 * Check if a path is within the allowed output directory
 */
export function isWithinOutputDir(filePath: string, distDir: string): boolean {
  const resolvedFilePath = runtime.path.resolve(filePath);
  const resolvedDistDir = runtime.path.resolve(distDir);

  return (
    resolvedFilePath.startsWith(resolvedDistDir + runtime.path.sep) ||
    resolvedFilePath === resolvedDistDir
  );
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

      await fs.ensureDir(runtime.path.dirname(dest));
      await fs.copy(src, dest, { overwrite: true });
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
    for await (const relPath of collector.walkFiles(
      srcDir,
      undefined,
      /node_modules/,
    )) {
      const filePath = runtime.path.join(srcDir, relPath);
      const isArtifact = KNOWN_SRC_ARTIFACTS.some((pattern) =>
        filePath.endsWith(pattern),
      );

      if (isArtifact) {
        try {
          await runtime.fs.remove(filePath);
          deleted.push(runtime.path.relative(projectRoot, filePath));
          validatorLogger.debug(`  Deleted: ${filePath}`);
        } catch (error) {
          failed.push(runtime.path.relative(projectRoot, filePath));
          validatorLogger
            .with({ error })
            .warn(`delete build artifact ${filePath}; delete it by hand`);
        }
      }
    }
  } catch (error) {
    validatorLogger.with({ error }).error("scan src/ for build artifacts");
  }

  if (deleted.length > 0) {
    validatorLogger.debug(`Cleaned ${deleted.length} artifact(s) from src/`);
  }

  return { deleted, failed };
}
