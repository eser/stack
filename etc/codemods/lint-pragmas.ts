// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Rewrites deno lint and deno fmt pragmas for oxlint and oxfmt (M0-T19), with
 * the rule map from the M0-T2 spike (TASK-175). Removed in M1-T37 (TASK-231)
 * after M1-T3 has run it.
 *
 * - `// deno-lint-ignore a b` becomes `// oxlint-disable-next-line a', b'`.
 * - `// deno-lint-ignore-file a` becomes `/* oxlint-disable a' *\/`.
 * - A rule that oxlint does not need (see DROPPED) is dropped and reported; a
 *   pragma left with no rule is removed.
 * - `deno-fmt-ignore` becomes `oxfmt-ignore`.
 * - A rule name missing from both maps is reported and its pragma left alone.
 *
 * Only real comments are read, so pragma text inside strings and docs stays.
 *
 *   node etc/codemods/lint-pragmas.ts [--dry-run] [--filter <substring>]... [path...]
 *
 * @module
 */

import * as fs from "node:fs";
import * as lib from "./lib.ts";

/** deno lint rule -> the oxlint rule that covers it (TASK-175, item 2). */
export const RULE_MAP: Readonly<Record<string, string>> = {
  "adjacent-overload-signatures": "typescript/adjacent-overload-signatures",
  "ban-ts-comment": "typescript/ban-ts-comment",
  "ban-types": "typescript/ban-types",
  "ban-untagged-ignore": "unicorn/no-abusive-eslint-disable",
  "constructor-super": "constructor-super",
  "default-param-last": "default-param-last",
  "eqeqeq": "eqeqeq",
  "for-direction": "for-direction",
  "getter-return": "getter-return",
  "jsx-boolean-value": "react/jsx-boolean-value",
  "jsx-button-has-type": "react/button-has-type",
  "jsx-curly-braces": "react/jsx-curly-brace-presence",
  "jsx-key": "react/jsx-key",
  "jsx-no-children-prop": "react/no-children-prop",
  "jsx-no-comment-text-nodes": "react/jsx-no-comment-textnodes",
  "jsx-no-duplicate-props": "react/jsx-no-duplicate-props",
  "jsx-no-unescaped-entities": "react/no-unescaped-entities",
  "jsx-no-useless-fragment": "react/jsx-no-useless-fragment",
  "jsx-props-no-spread-multi": "react/jsx-props-no-spread-multi",
  "jsx-void-dom-elements-no-children": "react/void-dom-elements-no-children",
  "no-array-constructor": "no-array-constructor",
  "no-async-promise-executor": "no-async-promise-executor",
  "no-await-in-loop": "no-await-in-loop",
  "no-case-declarations": "no-case-declarations",
  "no-class-assign": "no-class-assign",
  "no-compare-neg-zero": "no-compare-neg-zero",
  "no-cond-assign": "no-cond-assign",
  "no-console": "no-console",
  "no-const-assign": "no-const-assign",
  "no-constant-condition": "no-constant-condition",
  "no-control-regex": "no-control-regex",
  "no-debugger": "no-debugger",
  "no-delete-var": "no-delete-var",
  "no-dupe-class-members": "no-dupe-class-members",
  "no-dupe-else-if": "no-dupe-else-if",
  "no-dupe-keys": "no-dupe-keys",
  "no-duplicate-case": "no-duplicate-case",
  "no-empty": "no-empty",
  "no-empty-character-class": "no-empty-character-class",
  "no-empty-interface": "typescript/no-empty-interface",
  "no-empty-pattern": "no-empty-pattern",
  "no-eval": "no-eval",
  "no-ex-assign": "no-ex-assign",
  "no-explicit-any": "typescript/no-explicit-any",
  "no-external-import": "no-restricted-imports",
  "no-extra-boolean-cast": "no-extra-boolean-cast",
  "no-extra-non-null-assertion": "typescript/no-extra-non-null-assertion",
  "no-fallthrough": "no-fallthrough",
  "no-func-assign": "no-func-assign",
  "no-global-assign": "no-global-assign",
  "no-import-assign": "no-import-assign",
  "no-inner-declarations": "no-inner-declarations",
  "no-invalid-regexp": "no-invalid-regexp",
  "no-irregular-whitespace": "no-irregular-whitespace",
  "no-misused-new": "typescript/no-misused-new",
  "no-namespace": "typescript/no-namespace",
  "no-new-symbol": "no-new-native-nonconstructor",
  "no-non-null-asserted-optional-chain": "typescript/no-non-null-asserted-optional-chain",
  "no-obj-calls": "no-obj-calls",
  "no-prototype-builtins": "no-prototype-builtins",
  "no-redeclare": "no-redeclare",
  "no-regex-spaces": "no-regex-spaces",
  "no-self-assign": "no-self-assign",
  "no-self-compare": "no-self-compare",
  "no-setter-return": "no-setter-return",
  "no-shadow-restricted-names": "no-shadow-restricted-names",
  "no-sparse-arrays": "no-sparse-arrays",
  "no-this-alias": "typescript/no-this-alias",
  "no-this-before-super": "no-this-before-super",
  "no-throw-literal": "no-throw-literal",
  "no-top-level-await": "node/no-top-level-await",
  "no-undef": "no-undef",
  "no-unreachable": "no-unreachable",
  "no-unsafe-finally": "no-unsafe-finally",
  "no-unsafe-negation": "no-unsafe-negation",
  "no-unused-labels": "no-unused-labels",
  "no-unused-vars": "no-unused-vars",
  "no-var": "no-var",
  "no-window": "no-restricted-globals",
  "no-window-prefix": "no-restricted-globals",
  "no-with": "no-with",
  "prefer-as-const": "typescript/prefer-as-const",
  "prefer-const": "prefer-const",
  "prefer-namespace-keyword": "typescript/prefer-namespace-keyword",
  "require-await": "require-await",
  "require-yield": "require-yield",
  "single-var-declarator": "one-var",
  "use-isnan": "use-isnan",
  "valid-typeof": "valid-typeof",
};

/** deno lint rules with no oxlint rule, and what covers them instead. */
export const DROPPED: Readonly<Record<string, string>> = {
  "ban-unknown-rule-code": "oxlint's reportUnusedDisableDirectives",
  "ban-unused-ignore": "oxlint's reportUnusedDisableDirectives",
  "ban-untagged-todo": "validate-naming-and-todos",
  "camelcase": "validate-naming-and-todos",
  "no-await-in-sync-fn": "the oxc parser and tsc",
  "no-dupe-args": "the oxc parser",
  "no-octal": "the oxc parser",
  "no-empty-enum": "erasableSyntaxOnly",
  "no-import-assertions": "tsc",
  "no-invalid-triple-slash-reference": "tsc",
  "no-sloppy-imports": "tsc under nodenext",
  "verbatim-module-syntax": "verbatimModuleSyntax",
  "no-deprecated-deno-api": "nothing: Deno-only",
  "no-unversioned-import": "nothing: versions live in package.json",
  "no-sync-fn-in-async-fn": "nothing yet: no oxlint rule",
};

export type Stats = {
  files: number;
  changed: number;
  linePragmas: number;
  filePragmas: number;
  rules: Record<string, number>;
  dropped: string[];
  unknown: string[];
  fmtIgnores: number;
  unhandled: string[];
};

export const emptyStats = (): Stats => ({
  files: 0,
  changed: 0,
  linePragmas: 0,
  filePragmas: 0,
  rules: {},
  dropped: [],
  unknown: [],
  fmtIgnores: 0,
  unhandled: [],
});

const PRAGMA = /^\s*deno-lint-ignore(-file)?((?:\s+[A-Za-z0-9-]+)*)\s*$/;
const FMT_IGNORE = /^\s*deno-fmt-ignore(-file)?\s*$/;

/** Transforms one file's source; returns the new source and counts into stats. */
export const transformSource = (path: string, src: string, stats: Stats): string => {
  const parsed = lib.parseWithComments(path, src);
  if (parsed === null) {
    if (src.includes("deno-lint-ignore") || src.includes("deno-fmt-ignore")) {
      stats.unhandled.push(`${path}: does not parse`);
    }

    return src;
  }

  const edits: lib.Edit[] = [];

  for (const comment of parsed.comments) {
    const site = `${path}:${lib.lineOf(src, comment.start)}`;
    const fmt = FMT_IGNORE.exec(comment.value);

    if (fmt !== null) {
      if (fmt[1] !== undefined) {
        stats.unhandled.push(`${site}: deno-fmt-ignore-file has no oxfmt equivalent`);
        continue;
      }

      stats.fmtIgnores++;
      edits.push({
        start: comment.start,
        end: comment.end,
        produce: () => (comment.type === "Line" ? "// oxfmt-ignore" : "/* oxfmt-ignore */"),
      });
      continue;
    }

    const match = PRAGMA.exec(comment.value);
    if (match === null) {
      continue;
    }

    const isFile = match[1] !== undefined;
    const names = (match[2] ?? "").trim().split(/\s+/).filter((name) => name !== "");
    const unknown = names.filter((name) => RULE_MAP[name] === undefined && DROPPED[name] === undefined);

    if (unknown.length > 0) {
      stats.unknown.push(`${site}: ${unknown.join(", ")}`);
      continue;
    }

    const kept: string[] = [];

    for (const name of names) {
      stats.rules[name] = (stats.rules[name] ?? 0) + 1;

      const mapped = RULE_MAP[name];
      if (mapped === undefined) {
        stats.dropped.push(`${site}: ${name} (covered by ${DROPPED[name]})`);
      } else if (!kept.includes(mapped)) {
        kept.push(mapped);
      }
    }

    if (isFile) {
      stats.filePragmas++;
    } else {
      stats.linePragmas++;
    }

    if (kept.length === 0 && names.length > 0) {
      // Only dropped rules: remove the comment, and its line when it is alone.
      const lineStart = src.lastIndexOf("\n", comment.start - 1) + 1;
      const lineEndAt = src.indexOf("\n", comment.end);
      const lineEnd = lineEndAt === -1 ? src.length : lineEndAt + 1;
      const alone = src.slice(lineStart, comment.start).trim() === "" &&
        src.slice(comment.end, lineEnd).trim() === "";

      edits.push(
        alone
          ? { start: lineStart, end: lineEnd, produce: () => "" }
          : { start: comment.start, end: comment.end, produce: () => "" },
      );
      continue;
    }

    const directive = isFile ? "oxlint-disable" : "oxlint-disable-next-line";
    const rules = kept.length > 0 ? ` ${kept.join(", ")}` : "";

    edits.push({
      start: comment.start,
      end: comment.end,
      produce: () =>
        isFile || comment.type === "Block" ? `/* ${directive}${rules} */` : `// ${directive}${rules}`,
    });
  }

  return edits.length === 0 ? src : lib.applyEdits(src, edits);
};

/** Runs the codemod over the files the options select. */
export const run = (options: lib.CliOptions): Stats => {
  const stats = emptyStats();

  for (const path of lib.listFiles(options, lib.JS_AND_TS_EXTENSIONS)) {
    const src = fs.readFileSync(path, "utf8");
    if (!src.includes("deno-lint-ignore") && !src.includes("deno-fmt-ignore")) {
      continue;
    }

    stats.files++;
    const out = transformSource(path, src, stats);
    if (out === src) {
      continue;
    }

    stats.changed++;
    if (!options.dryRun) {
      fs.writeFileSync(path, out);
    }
  }

  return stats;
};

if (import.meta.main) {
  const stats = run(lib.parseCliArgs(process.argv.slice(2)));
  console.log(JSON.stringify(stats, null, 2));
}
