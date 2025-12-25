// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * License header validation tool.
 *
 * Validates that all TypeScript files have the correct copyright header.
 * Can be used as a library or as a standalone script.
 *
 * Library usage:
 * ```typescript
 * import * as licenses from "@eser/codebase/check-licenses";
 *
 * // Check licenses
 * const result = await licenses.validateLicenses();
 * if (!result.valid) {
 *   console.log("Missing headers:", result.missing);
 * }
 *
 * // Fix licenses
 * const fixResult = await licenses.validateLicenses({ fix: true });
 * console.log("Fixed:", fixResult.fixed);
 * ```
 *
 * CLI usage:
 *   deno -A check-licenses.ts        # Check licenses
 *   deno -A check-licenses.ts --fix  # Auto-fix missing/incorrect headers
 *
 * @module
 */

import * as pathPosix from "@std/path/posix";
import * as fsWalk from "@std/fs/walk";
import * as standardsRuntime from "@eser/standards/runtime";

/**
 * Options for license validation.
 */
export type ValidateLicensesOptions = {
  /** Root directory to scan (default: parent of codebase package) */
  readonly root?: string;
  /** Auto-fix missing or incorrect headers */
  readonly fix?: boolean;
};

/**
 * Information about a file with license issues.
 */
export type LicenseIssue = {
  /** File path */
  readonly path: string;
  /** Type of issue */
  readonly issue: "missing" | "incorrect";
  /** Whether the issue was fixed */
  readonly fixed: boolean;
};

/**
 * Result of license validation.
 */
export type ValidateLicensesResult = {
  /** Whether all files are valid */
  readonly valid: boolean;
  /** Files that were checked */
  readonly checked: number;
  /** Files with issues */
  readonly issues: LicenseIssue[];
  /** Number of files fixed (when fix: true) */
  readonly fixedCount: number;
};

const EXTENSIONS = ["*.js", ".ts", "*.jsx", ".tsx"];
const EXCLUDES = [
  /docs\/*$/,
  /etc\/coverage\/*$/,
  /etc\/temp\/*$/,
  /etc\/templates\/*$/,
  /node_modules\/*$/,
  /test\/apps\/cf-workers-app\/node_modules\/*$/,
  /test\/apps\/cf-workers-app\/worker-configuration\.d\.ts$/,
  /manifest\.gen\.ts$/,
];

const BASE_YEAR = "2023";
const RX_COPYRIGHT = new RegExp(
  `// Copyright ([0-9]{4})-present Eser Ozvataf and other contributors\\. All rights reserved\\. ([0-9A-Za-z-.]+) license\\.\n`,
);
const COPYRIGHT =
  `// Copyright ${BASE_YEAR}-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.`;

/**
 * Validates license headers in all TypeScript files.
 *
 * @param options - Validation options
 * @returns Validation result
 */
export const validateLicenses = async (
  options: ValidateLicensesOptions = {},
): Promise<ValidateLicensesResult> => {
  const { fix = false } = options;

  // Default to parent directory of codebase package
  const baseUrl = new URL(".", import.meta.url);
  const defaultRoot = pathPosix.join(pathPosix.fromFileUrl(baseUrl.href), "..");
  const root = options.root ?? defaultRoot;

  const issues: LicenseIssue[] = [];
  let checked = 0;
  let fixedCount = 0;

  for await (
    const entry of fsWalk.walk(root, {
      exts: EXTENSIONS,
      skip: EXCLUDES,
      includeDirs: false,
    })
  ) {
    checked++;
    const content = await standardsRuntime.runtime.fs.readTextFile(entry.path);
    const match = content.match(RX_COPYRIGHT);

    if (match !== null) {
      if (match[1] === BASE_YEAR) {
        // Everything is fine
        continue;
      }

      // Incorrect year
      if (!fix) {
        issues.push({ path: entry.path, issue: "incorrect", fixed: false });
        continue;
      }

      // Fix incorrect year
      const index = match.index ?? 0;
      const contentWithoutCopyright = content.replace(match[0], "");
      const contentWithCopyright = `${
        contentWithoutCopyright.substring(0, index)
      }${COPYRIGHT}\n${contentWithoutCopyright.substring(index)}`;
      await standardsRuntime.runtime.fs.writeTextFile(
        entry.path,
        contentWithCopyright,
      );
      issues.push({ path: entry.path, issue: "incorrect", fixed: true });
      fixedCount++;
      continue;
    }

    // Missing header
    if (!fix) {
      issues.push({ path: entry.path, issue: "missing", fixed: false });
      continue;
    }

    // Add missing header
    const contentWithCopyright = `${COPYRIGHT}\n${content}`;
    await standardsRuntime.runtime.fs.writeTextFile(
      entry.path,
      contentWithCopyright,
    );
    issues.push({ path: entry.path, issue: "missing", fixed: true });
    fixedCount++;
  }

  return {
    valid: issues.length === 0 || issues.every((i) => i.fixed),
    checked,
    issues,
    fixedCount,
  };
};

/**
 * CLI main function for standalone usage.
 */
const main = async (): Promise<void> => {
  const fix = standardsRuntime.runtime.process.args.includes("--fix");

  const result = await validateLicenses({ fix });

  if (result.issues.length === 0) {
    console.log(`Checked ${result.checked} files. All licenses are valid.`);
    return;
  }

  if (fix) {
    for (const issue of result.issues) {
      if (issue.fixed) {
        console.log(`Fixed ${issue.issue} header: ${issue.path}`);
      }
    }
    console.log(`Fixed ${result.fixedCount} files.`);
  } else {
    for (const issue of result.issues) {
      console.error(
        `${
          issue.issue === "missing" ? "Missing" : "Incorrect"
        } copyright header: ${issue.path}`,
      );
    }
    console.info(`Copyright header should be "${COPYRIGHT}"`);
    standardsRuntime.runtime.process.exit(1);
  }
};

if (import.meta.main) {
  await main();
}
