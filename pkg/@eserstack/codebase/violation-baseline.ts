// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Per-file violation baselines for validators that enforce a rule on new code
 * while existing code is migrated.
 *
 * A baseline records, per rule, how many violations each file had when it was
 * written. A file fails a rule only when it has more violations than its
 * baseline allows, so new code follows the rule from the start and the counts
 * only ever shrink. `validate-code-conventions` and `validate-runtime-js-apis`
 * keep their baselines under `.eser/baselines/`.
 *
 * @module
 */

import * as path from "@std/path";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as shared from "./file-tools-shared.ts";
import type { FileEntry } from "./file-tools-shared.ts";

/** rule -> repository-relative path -> allowed violation count */
export type Baseline<R extends string> = Readonly<
  Record<R, Readonly<Record<string, number>>>
>;

/** One violation of a baselined rule. */
export type RuleViolation<R extends string> = {
  readonly rule: R;
  readonly line: number;
  readonly message: string;
};

/** The violations found in one file. */
export type FileViolations<R extends string> = {
  /** Absolute path, as the walker returns it */
  readonly path: string;
  /** Path relative to the scanned root with `/` separators, as baselines record it */
  readonly relPath: string;
  readonly violations: readonly RuleViolation<R>[];
};

/** A violation above the baseline, in the shape file tools report. */
export type BaselineIssue = {
  readonly path: string;
  readonly line: number;
  readonly message: string;
};

const emptyCounts = <R extends string>(
  rules: readonly R[],
): Record<R, Record<string, number>> => {
  const counts = {} as Record<R, Record<string, number>>;
  for (const rule of rules) {
    counts[rule] = {};
  }

  return counts;
};

/** A baseline that allows no violation of any of `rules`. */
export const emptyBaseline = <R extends string>(
  rules: readonly R[],
): Baseline<R> => emptyCounts(rules);

/** `file` relative to `root`, with `/` separators on every platform. */
export const relativePath = (root: string, file: string): string =>
  path.relative(path.resolve(root), file).split(path.SEPARATOR).join("/");

/**
 * Resolves the `baseline` option of a validator against the scanned root.
 * Throws when the option is not a path, so a typo in the manifest fails loudly
 * instead of silently allowing nothing.
 */
export const resolveBaselinePath = (
  validatorName: string,
  root: string,
  option: unknown,
): string => {
  if (typeof option !== "string" || option === "") {
    throw new Error(
      `${validatorName}: the baseline option must be a file path relative to the root, got ${JSON.stringify(
        option,
      )}; fix the ${validatorName} step options in .eser/manifest.yml`,
    );
  }

  return path.resolve(root, option);
};

/**
 * Reads a baseline file. A missing file is an empty baseline, so a validator
 * without one fails on every violation.
 */
export const readBaseline = async <R extends string>(
  file: string,
  rules: readonly R[],
): Promise<Baseline<R>> => {
  if (!(await runtime.fs.exists(file))) {
    return emptyBaseline(rules);
  }

  const text = await runtime.fs.readTextFile(file);
  let parsed: Partial<Baseline<R>>;
  try {
    parsed = JSON.parse(text) as Partial<Baseline<R>>;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `baseline ${file} is not valid JSON (${reason}); regenerate it with --write-baseline`,
    );
  }

  return { ...emptyBaseline(rules), ...parsed };
};

/**
 * Loads each file and returns the violations `find` reports, leaving out the
 * files `skip` names and the files with none.
 */
export const collectViolations = async <R extends string>(
  root: string,
  files: readonly FileEntry[],
  find: (content: string) => readonly RuleViolation<R>[],
  skip: (relPath: string) => boolean,
): Promise<FileViolations<R>[]> => {
  const found: FileViolations<R>[] = [];

  for (const file of files) {
    const relPath = relativePath(root, file.path);
    if (skip(relPath)) continue;
    // Files load one at a time: reading thousands at once can exhaust the
    // open file handle limit.
    // oxlint-disable-next-line no-await-in-loop
    const content = await shared.loadContent(file);
    if (content === undefined) continue;
    const violations = find(content);
    if (violations.length === 0) continue;
    found.push({ path: file.path, relPath, violations });
  }

  return found;
};

/**
 * The violations of one file above its baseline. When a rule is over its
 * count, every violation of that rule in the file is reported, since the
 * baseline cannot tell which of them is new.
 */
export const issuesAboveBaseline = <R extends string>(
  baseline: Baseline<R>,
  file: FileViolations<R>,
): BaselineIssue[] => {
  const byRule = new Map<R, RuleViolation<R>[]>();
  for (const violation of file.violations) {
    const list = byRule.get(violation.rule) ?? [];
    list.push(violation);
    byRule.set(violation.rule, list);
  }

  const issues: BaselineIssue[] = [];
  for (const [rule, found] of byRule) {
    const allowed = baseline[rule][file.relPath] ?? 0;
    if (found.length <= allowed) continue;
    for (const violation of found) {
      issues.push({
        path: file.path,
        line: violation.line,
        message:
          allowed === 0
            ? violation.message
            : `${violation.message} [${found.length} in this file, baseline allows ${allowed}]`,
      });
    }
  }

  return issues;
};

/** Counts the given violations into a baseline for `rules`. */
export const buildBaseline = <R extends string>(
  rules: readonly R[],
  files: readonly FileViolations<R>[],
): Baseline<R> => {
  const counts = emptyCounts(rules);
  for (const file of files) {
    for (const violation of file.violations) {
      const byFile: Record<string, number> = counts[violation.rule];
      byFile[file.relPath] = (byFile[file.relPath] ?? 0) + 1;
    }
  }

  return counts;
};

/** The number of violations a baseline allows in total. */
export const baselineTotal = <R extends string>(
  baseline: Baseline<R>,
): number => {
  let total = 0;
  for (const byFile of Object.values<Readonly<Record<string, number>>>(
    baseline,
  )) {
    for (const count of Object.values(byFile)) {
      total += count;
    }
  }

  return total;
};

/**
 * Writes a baseline with its files sorted, so regenerating an unchanged
 * baseline produces no diff.
 */
export const writeBaselineFile = async <R extends string>(
  file: string,
  baseline: Baseline<R>,
): Promise<void> => {
  const sorted = Object.fromEntries(
    Object.entries<Readonly<Record<string, number>>>(baseline).map(
      ([rule, byFile]) => [
        rule,
        Object.fromEntries(
          Object.entries(byFile).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ],
    ),
  );

  await runtime.fs.mkdir(path.dirname(file), { recursive: true });
  await runtime.fs.writeTextFile(file, `${JSON.stringify(sorted, null, 2)}\n`);
};
