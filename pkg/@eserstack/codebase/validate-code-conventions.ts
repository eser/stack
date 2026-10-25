// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Code convention checker for rules that agents and reviewers keep missing:
 *
 * - `namespace-import`: import modules as `import * as name`. The exceptions
 *   are `import { runtime } from "@eserstack/standards/cross-runtime"` and the
 *   default import of a JSON module or a CSS module
 *   (`import styles from "./x.module.css"`). Type-only imports
 *   (`import type { ... }`) are allowed.
 * - `or-default`: a default after `||` (`value || ""`, `list || []`) also
 *   replaces valid falsy values such as `0` and `""`. Use `??`, or an explicit
 *   check when an empty value must fall back too.
 * - `export-star`: `export * from` (and `export type * from`) re-exports a
 *   whole module, so names shared by two modules collide (TS2308) and the
 *   public surface is hidden. Export the names explicitly, or re-export the
 *   module as a namespace with `export * as name from`.
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

import * as primitives from "@eserstack/primitives";
import * as standards from "@eserstack/standards";
import * as patterns from "@eserstack/standards/patterns";
import type * as shellArgs from "@eserstack/shell/args";
import * as cliSupport from "./cli-support.ts";
import * as fileTool from "./file-tool.ts";
import type { FileTool } from "./file-tool.ts";
import * as shared from "./file-tools-shared.ts";
import * as sourceMask from "./source-mask.ts";
import * as violationBaseline from "./violation-baseline.ts";

/** The rules this validator reports; each is a key of the baseline. */
export const RULES = ["namespace-import", "or-default", "export-star"] as const;

export type Rule = (typeof RULES)[number];

export type Violation = violationBaseline.RuleViolation<Rule>;

/** rule -> repository-relative path -> allowed violation count */
export type Baseline = violationBaseline.Baseline<Rule>;

export const DEFAULT_BASELINE_PATH = ".eser/baselines/code-conventions.json";

const TOOL_NAME = "validate-code-conventions";

/** Paths that follow their own ecosystem's conventions or are scratch output. */
const IGNORED_PREFIXES: readonly string[] = [".eser/recipes/", "etc/temp/"];

const isIgnored = (relPath: string): boolean =>
  IGNORED_PREFIXES.some((prefix) => relPath.startsWith(prefix));

const IMPORT_PATTERN =
  /^[ \t]*import[ \t]+(type[ \t]+)?([^"'`;]*?)[ \t\n]*from[ \t]*["']([^"']+)["']/gm;

const RUNTIME_IMPORT = /^\{\s*runtime\s*\}$/;

// A JSON module's only export is `default`, and a CSS module compiles to one,
// so for both the default import is the one form that works.
const DEFAULT_IMPORT = /^[A-Za-z_$][\w$]*$/;
const DEFAULT_ONLY_SPECIFIER = /\.(?:module\.css|json)$/;
const CROSS_RUNTIME_SPECIFIER = "@eserstack/standards/cross-runtime";

// A literal right after `||` is a default value; `a || b` between two
// expressions is left alone because it is often a real boolean condition.
const OR_DEFAULT_PATTERN = /\|\|\s*(?:["'`[{]|-?\d|null\b|undefined\b|new\s)/g;

// `export * from` and `export type * from`; `export * as name from` is a
// namespace re-export and stays allowed.
const EXPORT_STAR_PATTERN =
  /^[ \t]*export\s+(?:type\s+)?\*\s*from\s*["']([^"']+)["']/gm;

const isAllowedImport = (clause: string, specifier: string): boolean => {
  const trimmed = clause.trim();
  if (/^\*\s+as\s+\w+$/.test(trimmed)) return true;
  if (RUNTIME_IMPORT.test(trimmed) && specifier === CROSS_RUNTIME_SPECIFIER) {
    return true;
  }
  if (DEFAULT_IMPORT.test(trimmed) && DEFAULT_ONLY_SPECIFIER.test(specifier)) {
    return true;
  }
  // `import { type A, type B }` imports types only.
  const named = trimmed.match(/^\{([\s\S]*)\}$/);
  if (named !== null) {
    const parts = named[1]!
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "");
    return parts.length > 0 && parts.every((p) => p.startsWith("type "));
  }
  return false;
};

/** Finds convention violations in one TypeScript or JavaScript source. */
export const findViolations = (content: string): Violation[] => {
  const violations: Violation[] = [];
  const mask = sourceMask.codeMask(content);

  for (const match of content.matchAll(IMPORT_PATTERN)) {
    const start = match.index + match[0].indexOf("import");
    if (mask[start] === 1) continue;
    if (match[1] !== undefined) continue; // import type { ... }
    const clause = match[2]!;
    const specifier = match[3]!;
    if (isAllowedImport(clause, specifier)) continue;
    violations.push({
      rule: "namespace-import",
      line: sourceMask.lineOf(content, start),
      message: `import from "${specifier}" is not a namespace import; use \`import * as name from "${specifier}"\` (javascript-practices: Imports)`,
    });
  }

  for (const match of content.matchAll(OR_DEFAULT_PATTERN)) {
    if (mask[match.index] === 1) continue;
    violations.push({
      rule: "or-default",
      line: sourceMask.lineOf(content, match.index),
      message:
        'default value after `||` also replaces 0 and ""; use `??`, or an explicit check when an empty value must fall back too (javascript-practices: Explicit Checks)',
    });
  }

  for (const match of content.matchAll(EXPORT_STAR_PATTERN)) {
    const start = match.index + match[0].indexOf("export");
    if (mask[start] === 1) continue;
    const specifier = match[1]!;
    violations.push({
      rule: "export-star",
      line: sourceMask.lineOf(content, start),
      message: `\`export * from "${specifier}"\` re-exports the whole module; export the names explicitly (\`export { name } from "${specifier}"\`) or as a namespace (\`export * as name from "${specifier}"\`) (javascript-practices: Avoid Re-exports)`,
    });
  }

  return violations.sort((a, b) => a.line - b.line);
};

export const readBaseline = (file: string): Promise<Baseline> =>
  violationBaseline.readBaseline(file, RULES);

export const tool: FileTool = fileTool.createFileTool({
  name: TOOL_NAME,
  description:
    "Detect non-namespace imports, `||` defaults and `export *` beyond the recorded baseline",
  canFix: false,
  stacks: ["javascript"],
  defaults: { baseline: DEFAULT_BASELINE_PATH },
  extensions: patterns.JS_FILE_EXTENSIONS,

  checkAll: async (files, options) => {
    const baseline = await readBaseline(
      violationBaseline.resolveBaselinePath(
        TOOL_NAME,
        options.root,
        options["baseline"],
      ),
    );
    const found = await violationBaseline.collectViolations(
      options.root,
      files,
      findViolations,
      isIgnored,
    );

    return found.flatMap((file) =>
      violationBaseline.issuesAboveBaseline(baseline, file),
    );
  },
});

/** Records every current violation as the new baseline. */
export const writeBaseline = async (
  root: string,
  baselineFile: string = DEFAULT_BASELINE_PATH,
): Promise<number> => {
  const files = await shared.walkSourceFiles({
    root,
    extensions: patterns.JS_FILE_EXTENSIONS,
    exclude: [],
  });
  const found = await violationBaseline.collectViolations(
    root,
    files,
    findViolations,
    isIgnored,
  );
  const baseline = violationBaseline.buildBaseline(RULES, found);
  await violationBaseline.writeBaselineFile(
    violationBaseline.resolveBaselinePath(TOOL_NAME, root, baselineFile),
    baseline,
  );

  return violationBaseline.baselineTotal(baseline);
};

export const run: FileTool["run"] = tool.run;
export const validator: FileTool["validator"] = tool.validator;

const writeBaselineMain = async (): Promise<shellArgs.CliResult<void>> => {
  const total = await writeBaseline(".");
  const { output: out } = cliSupport.createCliContext();
  out.writeln(
    `${TOOL_NAME}: baseline written with ${total} violation(s) to ${DEFAULT_BASELINE_PATH}`,
  );
  await out.flush();

  return primitives.results.ok(undefined);
};

/**
 * CLI entry: checks the tree, or with `--write-baseline` records the current
 * violations as the new baseline.
 */
export const main: FileTool["main"] = async (cliArgs) =>
  cliArgs?.includes("--write-baseline") === true
    ? await writeBaselineMain()
    : await tool.main(cliArgs);

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // deno-lint-ignore no-top-level-await
  const result = await main(
    standards.crossRuntime.runtime.process.args as string[],
  );
  cliSupport.runCliMain(result);
}
