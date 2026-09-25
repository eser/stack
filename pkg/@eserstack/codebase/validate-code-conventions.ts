// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Code convention checker for rules that agents and reviewers keep missing:
 *
 * - `namespace-import`: import modules as `import * as name`. The only
 *   exception is `import { runtime } from "@eserstack/standards/cross-runtime"`.
 *   Type-only imports (`import type { ... }`) are allowed.
 * - `or-default`: a default after `||` (`value || ""`, `list || []`) also
 *   replaces valid falsy values such as `0` and `""`. Use `??`, or an explicit
 *   check when an empty value must fall back too.
 *
 * Existing violations are recorded per file in a baseline
 * (`.eser/baselines/code-conventions.json`). A file fails only when it has
 * more violations of a rule than its baseline allows, so new code follows the
 * rules while old code is migrated over time. After fixing violations, shrink
 * the baseline:
 *
 *   deno run -A ./pkg/@eserstack/codebase/validate-code-conventions.ts --write-baseline
 *
 * @module
 */

import * as path from "@std/path";
import * as standards from "@eserstack/standards";
import { JS_FILE_EXTENSIONS } from "@eserstack/standards/patterns";
import { createFileTool, type FileTool } from "./file-tool.ts";
import * as shared from "./file-tools-shared.ts";

export type Rule = "namespace-import" | "or-default";

export type Violation = {
  readonly rule: Rule;
  readonly line: number;
  readonly message: string;
};

/** rule -> repository-relative path -> allowed violation count */
export type Baseline = Readonly<
  Record<Rule, Readonly<Record<string, number>>>
>;

export const DEFAULT_BASELINE_PATH = ".eser/baselines/code-conventions.json";

/** Paths that follow their own ecosystem's conventions or are scratch output. */
const IGNORED_PREFIXES: readonly string[] = [".eser/recipes/", "etc/temp/"];

const isIgnored = (relPath: string): boolean =>
  IGNORED_PREFIXES.some((prefix) => relPath.startsWith(prefix));

const IMPORT_PATTERN =
  /^[ \t]*import[ \t]+(type[ \t]+)?([^"'`;]*?)[ \t\n]*from[ \t]*["']([^"']+)["']/gm;

const RUNTIME_IMPORT = /^\{\s*runtime\s*\}$/;
const CROSS_RUNTIME_SPECIFIER = "@eserstack/standards/cross-runtime";

// A literal right after `||` is a default value; `a || b` between two
// expressions is left alone because it is often a real boolean condition.
const OR_DEFAULT_PATTERN = /\|\|\s*(?:["'`[{]|-?\d|null\b|undefined\b|new\s)/g;

const isAllowedImport = (clause: string, specifier: string): boolean => {
  const trimmed = clause.trim();
  if (/^\*\s+as\s+\w+$/.test(trimmed)) return true;
  if (RUNTIME_IMPORT.test(trimmed) && specifier === CROSS_RUNTIME_SPECIFIER) {
    return true;
  }
  // `import { type A, type B }` imports types only.
  const named = trimmed.match(/^\{([\s\S]*)\}$/);
  if (named !== null) {
    const parts = named[1]!.split(",").map((p) => p.trim()).filter((p) =>
      p !== ""
    );
    return parts.length > 0 && parts.every((p) => p.startsWith("type "));
  }
  return false;
};

const lineOf = (content: string, index: number): number =>
  content.slice(0, index).split("\n").length;

/** Marks the positions that sit inside a comment or a string literal. */
const codeMask = (content: string): Uint8Array => {
  const mask = new Uint8Array(content.length);
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];
    if (ch === "/" && next === "/") {
      while (i < content.length && content[i] !== "\n") mask[i++] = 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = content.indexOf("*/", i + 2);
      const stop = end < 0 ? content.length : end + 2;
      while (i < stop) mask[i++] = 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      mask[i++] = 1;
      while (i < content.length && content[i] !== ch) {
        if (content[i] === "\\") mask[i++] = 1;
        // Template interpolations are code; keep the check simple and treat
        // the whole template as text.
        if (ch !== "`" && content[i] === "\n") break;
        mask[i++] = 1;
      }
      mask[i++] = 1;
      continue;
    }
    i++;
  }
  return mask;
};

/** Finds convention violations in one TypeScript or JavaScript source. */
export const findViolations = (content: string): Violation[] => {
  const violations: Violation[] = [];
  const mask = codeMask(content);

  for (const match of content.matchAll(IMPORT_PATTERN)) {
    const start = match.index! + match[0].indexOf("import");
    if (mask[start] === 1) continue;
    if (match[1] !== undefined) continue; // import type { ... }
    const clause = match[2]!;
    const specifier = match[3]!;
    if (isAllowedImport(clause, specifier)) continue;
    violations.push({
      rule: "namespace-import",
      line: lineOf(content, start),
      message:
        `import from "${specifier}" is not a namespace import; use \`import * as name from "${specifier}"\` (javascript-practices: Imports)`,
    });
  }

  for (const match of content.matchAll(OR_DEFAULT_PATTERN)) {
    if (mask[match.index!] === 1) continue;
    violations.push({
      rule: "or-default",
      line: lineOf(content, match.index!),
      message:
        'default value after `||` also replaces 0 and ""; use `??`, or an explicit check when an empty value must fall back too (javascript-practices: Explicit Checks)',
    });
  }

  return violations.sort((a, b) => a.line - b.line);
};

const emptyBaseline = (): Record<Rule, Record<string, number>> => ({
  "namespace-import": {},
  "or-default": {},
});

export const readBaseline = async (file: string): Promise<Baseline> => {
  const { runtime } = standards.crossRuntime;
  if (!(await runtime.fs.exists(file))) return emptyBaseline();
  const parsed = JSON.parse(await runtime.fs.readTextFile(file)) as Partial<
    Baseline
  >;
  return { ...emptyBaseline(), ...parsed };
};

const relativeTo = (root: string, file: string): string =>
  path.relative(path.resolve(root), file).split(path.SEPARATOR).join("/");

export const tool: FileTool = createFileTool({
  name: "validate-code-conventions",
  description:
    "Detect non-namespace imports and `||` defaults beyond the recorded baseline",
  canFix: false,
  stacks: ["javascript"],
  defaults: { baseline: DEFAULT_BASELINE_PATH },
  extensions: JS_FILE_EXTENSIONS,

  async checkAll(files, options) {
    const baselinePath = path.resolve(
      options.root,
      options["baseline"] as string,
    );
    const baseline = await readBaseline(baselinePath);
    const issues: { path: string; line: number; message: string }[] = [];

    for (const file of files) {
      const relPath = relativeTo(options.root, file.path);
      if (isIgnored(relPath)) continue;
      const content = await shared.loadContent(file);
      if (content === undefined) continue;
      const violations = findViolations(content);
      if (violations.length === 0) continue;

      for (const rule of ["namespace-import", "or-default"] as const) {
        const found = violations.filter((v) => v.rule === rule);
        const allowed = baseline[rule][relPath] ?? 0;
        if (found.length <= allowed) continue;
        for (const v of found) {
          issues.push({
            path: file.path,
            line: v.line,
            message: allowed === 0
              ? v.message
              : `${v.message} [${found.length} in this file, baseline allows ${allowed}]`,
          });
        }
      }
    }

    return issues;
  },
});

/** Records every current violation as the new baseline. */
export const writeBaseline = async (
  root: string,
  baselineFile: string = DEFAULT_BASELINE_PATH,
): Promise<number> => {
  const { runtime } = standards.crossRuntime;
  const files = await shared.walkSourceFiles({
    root,
    extensions: JS_FILE_EXTENSIONS,
    exclude: [],
  });
  const baseline = emptyBaseline();
  let total = 0;
  for (const file of files) {
    const relPath = relativeTo(root, file.path);
    if (isIgnored(relPath)) continue;
    const content = await shared.loadContent(file);
    if (content === undefined) continue;
    for (const v of findViolations(content)) {
      baseline[v.rule][relPath] = (baseline[v.rule][relPath] ?? 0) + 1;
      total++;
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(baseline).map(([rule, byFile]) => [
      rule,
      Object.fromEntries(
        Object.entries(byFile).sort(([a], [b]) => a.localeCompare(b)),
      ),
    ]),
  );
  const target = path.resolve(root, baselineFile);
  await runtime.fs.mkdir(path.dirname(target), { recursive: true });
  await runtime.fs.writeTextFile(
    target,
    `${JSON.stringify(sorted, null, 2)}\n`,
  );
  return total;
};

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;
export const main: FileTool["main"] = tool.main;

if (import.meta.main) {
  const args = standards.crossRuntime.runtime.process.args as string[];
  if (args.includes("--write-baseline")) {
    const total = await writeBaseline(".");
    console.log(
      `validate-code-conventions: baseline written with ${total} violation(s) to ${DEFAULT_BASELINE_PATH}`,
    );
  } else {
    const { runCliMain } = await import("./cli-support.ts");
    runCliMain(await main(args));
  }
}
