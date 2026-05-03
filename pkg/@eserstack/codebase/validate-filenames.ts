// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Filename convention checker — enforces kebab-case/snake_case per directory.
 *
 * Rules:
 * - `apps/services/` → snake_case only
 * - Everything else → kebab-case only
 * - Also checks for Windows-reserved names (CON, PRN, AUX, NUL, etc.)
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import { createFileTool, type FileTool, withGoValidator } from "./file-tool.ts";

// =============================================================================
// Naming rules
// =============================================================================

/** Windows reserved names (case-insensitive) */
const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/** snake_case pattern: lowercase letters, digits, underscores, dots */
const SNAKE_CASE = /^[a-z0-9_./[\]@-]+$/;

/** kebab-case pattern: lowercase letters, digits, hyphens, dots */
const KEBAB_CASE = /^[a-z0-9./[\]@-]+$/;

/** Default excluded paths (fallback when no .eser/manifest.yml config) */
const DEFAULT_EXCLUDES = [
  ".claude/",
  ".github/",
  ".git/",
  "CLAUDE.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "Makefile",
  "Dockerfile",
  "LICENSE",
  "README.md",
  "VERSION",
];

/** Check if a path matches any exclude pattern */
const isExcluded = (
  path: string,
  excludes: readonly string[],
): boolean => {
  for (const pattern of excludes) {
    if (pattern.includes("*")) {
      // Simple glob: "pkg/*/README.md" or "etc/templates/*/Makefile"
      const regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]+");
      if (new RegExp(regexStr).test(path)) {
        return true;
      }
    } else if (path.includes(pattern) || path.endsWith(pattern)) {
      return true;
    }
  }
  return false;
};

export const tool: FileTool = withGoValidator(createFileTool({
  name: "validate-filenames",
  description: "Enforce filename conventions (kebab-case / snake_case)",
  canFix: false,
  stacks: [],
  defaults: {},

  checkAll(files, options) {
    const issues = [];

    // Read config-driven rules or use defaults
    const configRules = options["rules"] as
      | Array<{
        directory: string;
        convention: string;
        exclude?: string[];
      }>
      | undefined;

    // Build exclude list from config or defaults
    const globalExcludes = (options["exclude"] as string[] | undefined) ??
      DEFAULT_EXCLUDES;

    for (const file of files) {
      // Skip globally excluded paths
      if (isExcluded(file.path, globalExcludes)) {
        continue;
      }

      const basename = file.name;
      const baseWithoutExt = basename.replace(/\.[^.]+$/, "");

      // Check for Windows reserved names
      if (WINDOWS_RESERVED.has(baseWithoutExt.toLowerCase())) {
        issues.push({
          path: file.path,
          message: `Windows-reserved filename: ${basename}`,
        });
        continue;
      }

      // Find matching rule from config
      if (configRules !== undefined) {
        let matched = false;
        for (const rule of configRules) {
          if (
            rule.directory === "*" || file.path.includes(rule.directory)
          ) {
            // Check rule-level excludes
            if (
              rule.exclude !== undefined &&
              isExcluded(file.path, rule.exclude)
            ) {
              matched = true;
              break;
            }

            const pattern = rule.convention === "snake_case"
              ? SNAKE_CASE
              : KEBAB_CASE;

            if (!pattern.test(basename)) {
              issues.push({
                path: file.path,
                message: `filename must be ${rule.convention}`,
              });
            }
            matched = true;
            break;
          }
        }
        if (matched) {
          continue;
        }
      }

      // Default: kebab-case for everything (no hardcoded directory rules)
      if (!KEBAB_CASE.test(basename)) {
        issues.push({
          path: file.path,
          message: "filename must be kebab-case",
        });
      }
    }

    return issues;
  },
}), "filenames");

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  const { runCliMain } = await import("./cli-support.ts");
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
  );
}
