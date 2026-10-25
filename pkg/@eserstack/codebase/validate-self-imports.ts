// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Self-import checker — detects a workspace package importing itself through
 * its own published name (`@eserstack/shell` importing `@eserstack/shell/env`).
 *
 * Locally that resolves through the workspace, so every check passes. When
 * the libraries were published to JSR (frozen at 4.5.x, decision-5), the
 * publish rewrote the specifier to `jsr:@eserstack/shell@^<version>/env` and
 * resolved it against the registry, where that version did not exist yet; the
 * dry run skipped that step, and it cost the v4.5.0 release three attempts.
 *
 * Inside a package, import your own modules by relative path.
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import * as patterns from "@eserstack/standards/patterns";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";

const PACKAGE_DIR_PATTERN = /(?:^|\/)pkg\/@eserstack\/([^/]+)\//;

/**
 * Lines that carry a module specifier: static imports/exports (including the
 * closing `} from` line of a multi-line import) and dynamic `import(...)`.
 */
const SPECIFIER_LINE_PATTERN =
  /^\s*(?:import\b|export\b|\})[^"'`]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/;

const isCommentLine = (line: string): boolean => {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
};

const escapeRe = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const tool: FileTool = fileTool.createFileTool({
  name: "validate-self-imports",
  description:
    "Detect a package importing itself by its published name (breaks JSR publish; use a relative path)",
  canFix: false,
  stacks: ["javascript"],
  defaults: {},
  extensions: patterns.JS_FILE_EXTENSIONS,

  checkFile(file, content) {
    if (content === undefined) return [];

    const packageMatch = PACKAGE_DIR_PATTERN.exec(file.path);
    const packageDir = packageMatch?.[1];
    if (packageDir === undefined) return [];

    const ownName = `@eserstack/${packageDir}`;
    const ownSpecifier = new RegExp(`^${escapeRe(ownName)}(?:/|$)`);
    const issues: { path: string; line: number; message: string }[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isCommentLine(line)) continue;

      const match = SPECIFIER_LINE_PATTERN.exec(line);
      if (match === null) continue;

      const specifier = match[1] ?? match[2] ?? match[3];
      if (specifier === undefined || !ownSpecifier.test(specifier)) continue;

      issues.push({
        path: file.path,
        line: i + 1,
        message: `package imports itself as "${specifier}" — use a relative path; JSR cannot resolve jsr:${ownName} while that version is still being published`,
      });
    }

    return issues;
  },
});

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main(
    standards.crossRuntime.runtime.process.args as string[],
  );
  cliSupport.runCliMain(result);
}
