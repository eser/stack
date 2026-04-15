// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * License header validation tool.
 *
 * Validates that all JavaScript/TypeScript files have the correct copyright header.
 * Can be used as a library or as a standalone script.
 *
 * Library usage:
 * ```typescript
 * import * as licenses from "@eserstack/codebase/validate-licenses";
 *
 * // Check licenses
 * const result = await licenses.run();
 * if (result.issues.length > 0) {
 *   console.log("Missing headers:", result.issues);
 * }
 *
 * // Fix licenses
 * await licenses.run({ fix: true });
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./validate-licenses.ts        # Check licenses
 *   deno run --allow-all ./validate-licenses.ts --fix  # Auto-fix missing/incorrect headers
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import { JS_FILE_EXTENSIONS } from "@eserstack/standards/patterns";
import {
  createFileTool,
  type FileEntry,
  type FileTool,
  type ToolIssue,
  type ToolOptions,
} from "./file-tool.ts";

// =============================================================================
// Constants
// =============================================================================

const BASE_YEAR = "2023";
const RX_COPYRIGHT = new RegExp(
  `// Copyright ([0-9]{4})-present Eser Ozvataf and other contributors\\. All rights reserved\\. ([0-9A-Za-z-.]+) license\\.\n`,
);
const COPYRIGHT =
  `// Copyright ${BASE_YEAR}-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.`;

/**
 * Tool-specific paths that are always skipped, regardless of user `exclude` config.
 * These are not user-configurable — they represent files that should never have
 * license headers (generated files, doc files, templates).
 *
 * Note: common directories (node_modules, .git, dist, etc.) are handled by
 * DEFAULT_EXCLUDES in file-tools-shared.ts.
 */
const SKIP_PATTERNS = [
  /docs\//,
  /etc\/templates\//,
  /manifest\.gen\.ts$/,
];

const shouldSkip = (path: string): boolean =>
  SKIP_PATTERNS.some((p) => p.test(path));

// =============================================================================
// Check function
// =============================================================================

const checkLicenseHeader = (
  file: FileEntry,
  content: string | undefined,
  options: ToolOptions,
): ToolIssue[] => {
  if (content === undefined || shouldSkip(file.path)) {
    return [];
  }

  const hasShebang = content.startsWith("#!");
  const shebangEnd = hasShebang ? content.indexOf("\n") + 1 : 0;
  const afterShebang = content.slice(shebangEnd);
  const match = afterShebang.match(RX_COPYRIGHT);

  if (match !== null) {
    if (match[1] === BASE_YEAR) {
      return [];
    }
    return [{
      path: file.path,
      message: "incorrect copyright year",
      fixed: options.fix,
    }];
  }

  return [{
    path: file.path,
    message: "missing copyright header",
    fixed: options.fix,
  }];
};

// =============================================================================
// Fix function
// =============================================================================

const fixLicenseHeader = (
  file: FileEntry,
  content: string,
  _options: ToolOptions,
): { path: string; oldContent: string; newContent: string } | undefined => {
  if (shouldSkip(file.path)) {
    return undefined;
  }

  const hasShebang = content.startsWith("#!");
  const shebangEnd = hasShebang ? content.indexOf("\n") + 1 : 0;
  const afterShebang = content.slice(shebangEnd);
  const match = afterShebang.match(RX_COPYRIGHT);

  if (match !== null && match[1] === BASE_YEAR) {
    return undefined; // Already correct
  }

  let newContent: string;
  if (match !== null) {
    // Incorrect year — replace existing header in full content
    const shebang = content.slice(0, shebangEnd);
    const rest = afterShebang.replace(match[0], "");
    newContent = `${shebang}${COPYRIGHT}\n${rest}`;
  } else {
    // Missing header — insert after shebang if present
    newContent = hasShebang
      ? `${content.slice(0, shebangEnd)}${COPYRIGHT}\n${afterShebang}`
      : `${COPYRIGHT}\n${content}`;
  }

  return { path: file.path, oldContent: content, newContent };
};

// =============================================================================
// Tool
// =============================================================================

export const tool: FileTool = createFileTool({
  name: "validate-licenses",
  description: "Validate license headers",
  canFix: true,
  stacks: ["javascript"],
  defaults: {},
  // Dotted format required — matches path.extname() output in walkSourceFiles git-aware path
  extensions: JS_FILE_EXTENSIONS,

  checkFile: checkLicenseHeader,
  fixFile: fixLicenseHeader,
});

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  const { runCliMain } = await import("./cli-support.ts");
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
  );
}
