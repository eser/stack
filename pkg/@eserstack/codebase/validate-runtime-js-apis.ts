// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runtime API portability checker. Library code reaches the file system, the
 * environment and the process through `runtime` from
 * `@eserstack/standards/cross-runtime`, so the same code runs on Deno, Node and
 * Bun (javascript-practices: Cross-Runtime APIs). The rules:
 *
 * - `deno`: the `Deno.*` APIs listed in `DENO_PATTERNS`
 * - `process`: any member of Node's global `process` (`process.env`,
 *   `process.exit`, `globalThis.process.argv`, ...)
 * - `bun`: any member of the `Bun` global
 *
 * Matches inside comments and string literals are ignored. A file that
 * declares its own `process` binding (a child process handle, a parameter,
 * `const { process } = runtime`) is only checked for `process.env` and
 * `globalThis.process.*`: a line scanner cannot tell which scope a
 * `process.x` belongs to, and neither of those bindings has an `env` member.
 *
 * Skipped: test files, which run under one runtime, and the cross-runtime
 * layer itself (`standards/cross-runtime/`). Scripts that run on one runtime
 * by design are listed in the `exclude` option of the manifest step, each with
 * the reason.
 *
 * Existing violations are recorded per file in a baseline
 * (`.eser/baselines/runtime-js-apis.json`; a missing file allows none). A file
 * fails only when it has more violations of a rule than its baseline allows.
 * After fixing violations, shrink the baseline:
 *
 *   deno run -A ./pkg/@eserstack/codebase/validate-runtime-js-apis.ts --write-baseline
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
export const RULES = ["deno", "process", "bun"] as const;

export type Rule = (typeof RULES)[number];

export type Violation = violationBaseline.RuleViolation<Rule>;

export const DEFAULT_BASELINE_PATH = ".eser/baselines/runtime-js-apis.json";

const TOOL_NAME = "validate-runtime-js-apis";

const RULE_REFERENCE = "(javascript-practices: Cross-Runtime APIs)";

type ForbiddenPattern = {
  readonly pattern: RegExp;
  readonly replacement: string;
};

const DENO_PATTERNS: readonly ForbiddenPattern[] = [
  { pattern: /\bDeno\.cwd\(\)/g, replacement: "runtime.process.cwd()" },
  { pattern: /\bDeno\.env\.get\b/g, replacement: "runtime.env.get()" },
  { pattern: /\bDeno\.env\.set\b/g, replacement: "runtime.env.set()" },
  { pattern: /\bDeno\.env\.delete\b/g, replacement: "runtime.env.delete()" },
  { pattern: /\bDeno\.env\.has\b/g, replacement: "runtime.env.has()" },
  {
    pattern: /\bDeno\.env\.toObject\b/g,
    replacement: "runtime.env.toObject()",
  },
  {
    pattern: /\bDeno\.readTextFile\b/g,
    replacement: "runtime.fs.readTextFile()",
  },
  { pattern: /\bDeno\.readFile\b/g, replacement: "runtime.fs.readFile()" },
  {
    pattern: /\bDeno\.writeTextFile\b/g,
    replacement: "runtime.fs.writeTextFile()",
  },
  { pattern: /\bDeno\.writeFile\b/g, replacement: "runtime.fs.writeFile()" },
  { pattern: /\bDeno\.mkdir\b/g, replacement: "runtime.fs.mkdir()" },
  { pattern: /\bDeno\.remove\b/g, replacement: "runtime.fs.remove()" },
  { pattern: /\bDeno\.stat\b/g, replacement: "runtime.fs.stat()" },
  { pattern: /\bDeno\.lstat\b/g, replacement: "runtime.fs.lstat()" },
  { pattern: /\bDeno\.readDir\b/g, replacement: "runtime.fs.readDir()" },
  { pattern: /\bDeno\.copyFile\b/g, replacement: "runtime.fs.copyFile()" },
  { pattern: /\bDeno\.rename\b/g, replacement: "runtime.fs.rename()" },
  {
    pattern: /\bDeno\.open\b/g,
    replacement: "runtime.fs (or @eserstack/streams)",
  },
  { pattern: /\bDeno\.exit\b/g, replacement: "runtime.process.exit()" },
  {
    pattern: /\bnew Deno\.Command\b/g,
    replacement: "runtime.exec.spawn() (or @eserstack/shell/exec)",
  },
  { pattern: /\bDeno\.args\b/g, replacement: "runtime.process.args" },
];

// `process.x` or `globalThis.process.x`, but not a member access such as
// `runtime.process.x`. Group 1 is the `globalThis.` prefix, group 2 the member.
const PROCESS_PATTERN =
  /(?<![\w$.])(globalThis\.)?process\.([A-Za-z_$][\w$]*)/g;

const BUN_PATTERN = /(?<![\w$.])(?:globalThis\.)?Bun\.([A-Za-z_$][\w$]*)/g;

// Declarations that bind a local `process`: `const process = spawn()`,
// `const { process } = runtime`, a parameter `(process: ChildProcess)`.
const LOCAL_PROCESS_BINDINGS: readonly RegExp[] = [
  /\b(?:const|let|var)\s+process\b/g,
  /\b(?:const|let|var)\s*\{[^}]*\bprocess\s*[,}]/g,
  /[(,]\s*process\s*\??\s*[:,)=]/g,
];

const PROCESS_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ["env", "runtime.env.get()"],
  ["argv", "runtime.process.args"],
  ["cwd", "runtime.process.cwd()"],
  ["chdir", "runtime.process.chdir()"],
  ["exit", "runtime.process.exit()"],
  ["exitCode", "runtime.process.setExitCode()"],
  ["execPath", "runtime.process.execPath()"],
  ["pid", "runtime.process.pid"],
  ["stdin", "runtime.process.stdin"],
  ["stdout", "runtime.process.stdout"],
  ["stderr", "runtime.process.stderr"],
  ["platform", "getPlatform()"],
  ["arch", "getArch()"],
]);

const BUN_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ["env", "runtime.env.get()"],
  ["argv", "runtime.process.args"],
  ["spawn", "runtime.exec.spawn() (or @eserstack/shell/exec)"],
  ["spawnSync", "runtime.exec.spawn() (or @eserstack/shell/exec)"],
  ["file", "runtime.fs"],
  ["write", "runtime.fs.writeFile()"],
  ["version", "runtime.version"],
]);

const DEFAULT_REPLACEMENT = "the matching runtime API";

const TEST_FILE_PATTERN = /[._]test\.[cm]?[jt]sx?$/;
const CROSS_RUNTIME_DIR = "standards/cross-runtime/";

const isSkipped = (relPath: string): boolean =>
  TEST_FILE_PATTERN.test(relPath) || relPath.includes(CROSS_RUNTIME_DIR);

const hasCodeMatch = (
  content: string,
  mask: Uint8Array,
  pattern: RegExp,
): boolean => {
  for (const match of content.matchAll(pattern)) {
    if (mask[match.index] !== 1) return true;
  }

  return false;
};

const advice = (replacement: string): string =>
  `use ${replacement} from @eserstack/standards/cross-runtime ${RULE_REFERENCE}`;

/** Finds direct runtime API usage in one TypeScript or JavaScript source. */
export const findViolations = (content: string): Violation[] => {
  const violations: Violation[] = [];
  const mask = sourceMask.codeMask(content);

  for (const { pattern, replacement } of DENO_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      if (mask[match.index] === 1) continue;
      violations.push({
        rule: "deno",
        line: sourceMask.lineOf(content, match.index),
        message: `direct Deno API usage: ${match[0]}; ${advice(replacement)}`,
      });
    }
  }

  const shadowsProcess = LOCAL_PROCESS_BINDINGS.some((binding) =>
    hasCodeMatch(content, mask, binding),
  );
  for (const match of content.matchAll(PROCESS_PATTERN)) {
    if (mask[match.index] === 1) continue;
    const viaGlobalThis = match[1] !== undefined;
    const member = match[2]!;
    if (shadowsProcess && !viaGlobalThis && member !== "env") continue;
    violations.push({
      rule: "process",
      line: sourceMask.lineOf(content, match.index),
      message: `direct Node.js API usage: ${match[0]}; ${advice(
        PROCESS_REPLACEMENTS.get(member) ?? DEFAULT_REPLACEMENT,
      )}`,
    });
  }

  for (const match of content.matchAll(BUN_PATTERN)) {
    if (mask[match.index] === 1) continue;
    const member = match[1]!;
    violations.push({
      rule: "bun",
      line: sourceMask.lineOf(content, match.index),
      message: `direct Bun API usage: ${match[0]}; ${advice(
        BUN_REPLACEMENTS.get(member) ?? DEFAULT_REPLACEMENT,
      )}`,
    });
  }

  return violations.sort((a, b) => a.line - b.line);
};

export const tool: FileTool = fileTool.createFileTool({
  name: TOOL_NAME,
  description:
    "Detect direct Deno, Node.js process and Bun API usage beyond the recorded baseline (use @eserstack/standards/cross-runtime instead)",
  canFix: false,
  stacks: ["javascript"],
  defaults: { baseline: DEFAULT_BASELINE_PATH },
  extensions: patterns.JS_FILE_EXTENSIONS,

  checkAll: async (files, options) => {
    const baseline = await violationBaseline.readBaseline(
      violationBaseline.resolveBaselinePath(
        TOOL_NAME,
        options.root,
        options["baseline"],
      ),
      RULES,
    );
    const found = await violationBaseline.collectViolations(
      options.root,
      files,
      findViolations,
      isSkipped,
    );

    return found.flatMap((file) =>
      violationBaseline.issuesAboveBaseline(baseline, file),
    );
  },
});

/**
 * Records every current violation under `root` as the new baseline. The
 * manifest step's `exclude` list does not apply here, so files it excludes
 * are counted too; their entries are harmless.
 */
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
    isSkipped,
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
