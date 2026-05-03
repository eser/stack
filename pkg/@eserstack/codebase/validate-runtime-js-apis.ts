// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runtime API portability checker — detects direct usage of runtime-specific
 * APIs (Deno.*, Node.js process.*, Bun.*) that should go through the
 * cross-runtime abstraction layer `@eserstack/standards/cross-runtime`.
 *
 * Allowed exclusions:
 * - `@eserstack/standards/cross-runtime/` — the abstraction layer itself
 * - Test files (`*_test.ts`) — run under a specific runtime
 * - Build/compile scripts — inherently runtime-specific
 *
 * @module
 */

import * as standards from "@eserstack/standards";
import { JS_FILE_EXTENSIONS } from "@eserstack/standards/patterns";
import { createFileTool, type FileTool, withGoValidator } from "./file-tool.ts";

type ForbiddenPattern = {
  readonly pattern: RegExp;
  readonly replacement: string;
};

const DENO_PATTERNS: readonly ForbiddenPattern[] = [
  { pattern: /\bDeno\.cwd\(\)/, replacement: "runtime.process.cwd()" },
  { pattern: /\bDeno\.env\.get\b/, replacement: "runtime.env.get()" },
  { pattern: /\bDeno\.env\.set\b/, replacement: "runtime.env.set()" },
  { pattern: /\bDeno\.env\.delete\b/, replacement: "runtime.env.delete()" },
  { pattern: /\bDeno\.env\.has\b/, replacement: "runtime.env.has()" },
  {
    pattern: /\bDeno\.env\.toObject\b/,
    replacement: "runtime.env.toObject()",
  },
  {
    pattern: /\bDeno\.readTextFile\b/,
    replacement: "runtime.fs.readTextFile()",
  },
  { pattern: /\bDeno\.readFile\b/, replacement: "runtime.fs.readFile()" },
  {
    pattern: /\bDeno\.writeTextFile\b/,
    replacement: "runtime.fs.writeTextFile()",
  },
  { pattern: /\bDeno\.writeFile\b/, replacement: "runtime.fs.writeFile()" },
  { pattern: /\bDeno\.mkdir\b/, replacement: "runtime.fs.mkdir()" },
  { pattern: /\bDeno\.remove\b/, replacement: "runtime.fs.remove()" },
  { pattern: /\bDeno\.stat\b/, replacement: "runtime.fs.stat()" },
  { pattern: /\bDeno\.lstat\b/, replacement: "runtime.fs.lstat()" },
  { pattern: /\bDeno\.readDir\b/, replacement: "runtime.fs.readDir()" },
  { pattern: /\bDeno\.copyFile\b/, replacement: "runtime.fs.copyFile()" },
  { pattern: /\bDeno\.rename\b/, replacement: "runtime.fs.rename()" },
  {
    pattern: /\bDeno\.open\b/,
    replacement: "runtime.fs (or @eserstack/streams)",
  },
  { pattern: /\bDeno\.exit\b/, replacement: "runtime.process.exit()" },
  {
    pattern: /\bnew Deno\.Command\b/,
    replacement: "runtime.exec.spawn() (or @eserstack/shell/exec)",
  },
  {
    pattern: /\bDeno\.args\b/,
    replacement: "runtime.process.args",
  },
];

const SKIP_PATTERNS: readonly RegExp[] = [];

const isSkipped = (path: string): boolean =>
  SKIP_PATTERNS.some((p) => p.test(path));

const isInComment = (line: string, matchIndex: number): boolean => {
  const before = line.slice(0, matchIndex);
  return before.includes("//") ||
    (before.includes("/*") && !before.includes("*/"));
};

const isInString = (line: string, matchIndex: number): boolean => {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;

  for (let i = 0; i < matchIndex; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";
    if (prev === "\\") continue;

    if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
    if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
    if (ch === "`" && !inSingle && !inDouble) inTemplate = !inTemplate;
  }

  return inSingle || inDouble || inTemplate;
};

export const tool: FileTool = withGoValidator(createFileTool({
  name: "validate-runtime-js-apis",
  description:
    "Detect direct usage of runtime-specific APIs (use @eserstack/standards/cross-runtime instead)",
  canFix: false,
  stacks: ["javascript"],
  defaults: {},
  extensions: JS_FILE_EXTENSIONS,

  checkFile(file, content) {
    if (content === undefined) return [];
    if (isSkipped(file.path)) return [];

    const issues: { path: string; line: number; message: string }[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      for (const { pattern, replacement } of DENO_PATTERNS) {
        const match = pattern.exec(line);
        if (match === null) continue;
        if (isInComment(line, match.index)) continue;
        if (isInString(line, match.index)) continue;

        issues.push({
          path: file.path,
          line: i + 1,
          message: `direct Deno API usage: ${
            match[0]
          } — use @eserstack/standards/cross-runtime (${replacement})`,
        });
      }
    }

    return issues;
  },
}), "runtime-js-apis");

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  const { runCliMain } = await import("./cli-support.ts");
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
  );
}
