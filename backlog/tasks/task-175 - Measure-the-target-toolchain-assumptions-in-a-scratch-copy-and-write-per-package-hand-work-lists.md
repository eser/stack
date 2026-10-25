---
id: TASK-175
title: >-
  Measure the target toolchain assumptions in a scratch copy and write
  per-package hand-work lists
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:40'
labels:
  - spike
  - tooling
  - tests
  - ffi
  - build
milestone: m-0
dependencies: []
priority: high
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In a scratch clone that is never committed, check these assumptions:
(1) oxfmt pinned at 0.73.x with printWidth 80 and sortPackageJson off, run on docs/, backlog/, .agents/, CHANGELOG.md and a TS sample, with the diff size per file type.
(2) The 105 configured deno lint rules mapped to oxlint, with the gaps listed.
(3) Whether TypeScript 7.0.2 accepts allowImportingTsExtensions, erasableSyntaxOnly, verbatimModuleSyntax, resolveJsonModule with `with { type: "json" }` under nodenext, and isolatedDeclarations. Also whether an emit config with rewriteRelativeImportExtensions and without allowImportingTsExtensions accepts the .ts specifiers.
(4) A tsc 7 emit of fp and standards, packed with pnpm pack (note how workspace:* is rewritten) and installed together into a scratch consumer with overrides on Node 26. If this fails, name the fallback emitter.
(5) Whether @std/assert and @std/testing/mock run under `node --test` together with node:test describe and it.
(6) Whether node --test discovers .test.ts files from globs, runs one process per file and writes LCOV.
(7) node:ffi on Node 26.9 or later against libeser_ajan, with a throwaway `EserAjanCall(name, requestJson)` dispatcher prototype built only in the scratch clone that wraps a few existing exports. Measure four things:
  (a) loading the library and calling the dispatcher through node:ffi with no extra flag: `dlopen`, the `EserAjanVersion` handshake, a string-in, string-out call, reading the returned C string and releasing it with `EserAjanFree`;
  (b) the worker-thread pattern: a `node:worker_threads` worker that opens the library with its own `dlopen` and answers by message, its call throughput against direct main-thread calls, main-thread timer drift and fs latency while 8 workers block in one-second calls, cancellation of a blocked call from the main thread through the matching cancel or close export, and whether pin_image (RTLD_NODELETE) keeps a second `dlopen` in another thread safe;
  (c) whether the Go-in-host teardown SIGSEGV seen under Deno happens under Node, over repeated runs of load, call, worker exit and process exit, with and without the hard exits in codebase/cli-support.ts and workflows/main.ts;
  (d) stdin, raw mode and SIGWINCH sharing between Go and Node: with the Go TUI keypress reader and its SIGWINCH handler active, whether `process.stdin.setRawMode`, keypress delivery and stdout `resize` events still work, run inside a pseudo-terminal.
Record the result of (7) in decision-37 before M1 starts. koffi is not a fallback: the loader tries node:ffi, then the WASM build (WASI, decision-45), then reports a clear error and exits. If any of (a) to (d) fails in a way the dispatcher and worker design cannot work around, decision-37 records the failure for the owner before M1 starts. Record the exact Node version used, because .node-version and CI pin that minor (decision-14).
(8) Whether the jsr npm CLI downloads Deno to publish.
(9) The tsc 7 error count over the tree with the draft tsconfig, grouped by package.
(10) Whether `npx` can run a package bin from inside a binary started by an npm launcher, with the timing, to inform decision npx-noskills-hooks.
Then run a throwaway codemod and `node --test` per package, and write each package's residual hand-work list into the notes of the matching M1 task: failing tests, Deno and Bun APIs, deno-spawning tests, assertion semantic differences, transitive .tsx imports, and the Go twin and doc files naming Deno or Bun. Keep the draft .oxlintrc.json, .oxfmtrc.json and tsconfig.json in the task notes.

Plan key: M0-T2. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the ten assumptions is marked confirmed or refuted in the task notes, with the command used and its output
- [x] #2 Every M1 wave B task has a hand-work list in its notes, including Go and doc files
- [x] #3 The baseline tsc 7 error count is recorded per package
- [x] #4 Draft .oxlintrc.json, .oxfmtrc.json and tsconfig.json and the lint rule mapping table are in the task notes
- [x] #5 `git status` in the repo shows no changes from this task outside backlog/ (task notes and decision-37)
- [x] #6 Measurement (a) is recorded: a script in the task notes loads libeser_ajan through node:ffi with no extra flag, passes the version handshake and makes a dispatcher call whose returned string is read and freed, with its output on macOS arm64 and Linux
- [x] #7 Measurement (b) is recorded with numbers: worker and main-thread call throughput, main-thread timer drift and an fs.promises.readFile time while 8 workers block in one-second calls, the time for a main-thread cancel to end a blocked worker call, and whether a second `dlopen` in a worker works
- [x] #8 Measurement (c) is recorded: the exit codes and any signal from at least 50 runs of load, call, worker exit and process exit, with and without the hard exits in codebase/cli-support.ts and workflows/main.ts
- [x] #9 Measurement (d) is recorded: a pseudo-terminal script shows whether raw mode, keypress delivery and stdout `resize` events work while the Go keypress reader and SIGWINCH handler are active
- [x] #10 decision-37 states whether the node:ffi dispatcher and worker design holds, citing measurements (a) to (d), and the task notes record the exact Node version the measurements ran on
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Spike outcome (2026-10-24)

All measurements ran in throwaway scratch copies of the working tree outside the repo, on Node v26.12.1 (installed with nvm; the default nvm alias 26 resolves to it). This task changed nothing in the repo outside backlog/ (these notes, the hand-work notes of TASK-201 to TASK-227, and decision-37); the other working-tree changes come from the other tasks done in the same session.

| # | assumption | result |
| --- | --- | --- |
| 1 | oxfmt 0.73.x, printWidth 80, sortPackageJson off, gives a small mechanical diff | PARTIAL: mechanical and idempotent; 471 of 671 files change on the five paths, 81 once backlog/ is ignored (which deno fmt also ignores); the TS layout change is the real cost (about 48% of TS files repo-wide), fit for one reformat commit |
| 2 | 105 deno lint rules map to oxlint | 104 rules (105 counted no-const-assign twice); 88 oxlint rules cover 89; 15 gaps, of which one (no-sync-fn-in-async-fn) is a real gap |
| 3 | TS 7.0.2 accepts the five options; emit rewrites .ts specifiers | CONFIRMED, isolatedDeclarations also needs declaration: true under noEmit |
| 4 | tsc 7 emit of fp and standards, pnpm pack, install on Node 26 | CONFIRMED with tsc 7 alone; standards needs isolatedDeclarations off for emit until 25 annotations are fixed (tsc 7 otherwise drops 5 .d.ts and exits 1); workspace:* packs to the exact version |
| 5 | @std/assert and @std/testing/mock under node --test with describe/it | CONFIRMED with caveats (no leak sanitizers: a leaked timer hangs the file, so CI needs --test-force-exit; late async errors do not fail the run; std diffs always colored); test-kit runs unchanged as a workspace link, not from an installed tarball |
| 6 | node --test discovers .ts globs, one process per file, LCOV | CONFIRMED; .tsx cannot load; default discovery is broad, so pass an explicit glob; coverage is still experimental |
| 7 | node:ffi dispatcher and worker design | HOLDS (a, b, c), (d) with a one-terminal-owner rule; recorded in decision-37 |
| 8 | the jsr npm CLI downloads Deno to publish | CONFIRMED: jsr@0.14.3 downloads a pinned Deno 2.6.7 (41 MB zip, 89 MB binary) unless DENO_BIN_PATH is set |
| 9 | tsc 7 baseline error count per package | 103 errors with @types/deno (82 of them isolatedDeclarations), 0 in 29 packages; table below |
| 10 | npx runs a package bin from inside a binary an npm launcher started | CONFIRMED; costs 140 to 250 ms warm and up to 0.7 s cold per call over a direct bin call (about 35 ms) |

Hand-work lists: every M1 wave B task (TASK-201 to TASK-227) has its list in its notes. Overall 420 test files: 381 pass and 39 fail under node --test after the throwaway codemod (5,736 tests pass, 88 fail). Cross-cutting findings: @std/fs's stable API calls Deno.* internally, so every @std/fs import fails on Node (bundler, laroux-bundler); `execPath() run` spawns become `node run` (noskills, noskills-web, noskills-server-worker); the standards Node adapter rejects an aborted spawn and creates makeTempDir siblings with an empty prefix; type stripping keeps source text, so fn.toString() parsing in di breaks on paren-less arrows; `new Request` with a stream body needs `duplex: "half"`; import.meta.main works on Node 26.12.1. The FFI suites ran through koffi in that run, since node:ffi lands in TASK-202.

## Items 1 and 2: oxfmt and oxlint (2026-10-24)

Versions: oxfmt 0.73.0 (the only 0.73.x; 0.74.0 is the newest), oxlint 1.89.0 (newest 1.x), Node v26.12.1, npm 11.20.0, deno 2.9.6 for the baseline; installed with `npm install --save-exact oxfmt@0.73.0 oxlint@1.89.0` in a scratch dir and run on a scratch copy. Option names come from oxfmt's configuration_schema.json: printWidth, sortPackageJson, proseWrap (always|never|preserve, default preserve), quoteProps, trailingComma (default all), embeddedLanguageFormatting (auto|off), objectWrap, ignorePatterns, overrides.

### (1) oxfmt 0.73.0 with printWidth 80 and sortPackageJson off: PARTIAL

The premise is only partly true: the root deno.json `exclude` lists docs/, backlog/ and .claude/, so deno fmt never formatted docs/ or backlog/ (`deno fmt --no-config --check docs`: 8 of 11 not formatted; backlog: 390 of 391). Only .agents/, CHANGELOG.md and the TS sample are deno-fmt clean (`deno fmt --check .agents CHANGELOG.md pkg/@eserstack/fp pkg/@eserstack/standards`: 269 files clean).

Run A, `{"printWidth":80,"sortPackageJson":false}` over docs/ backlog/ .agents/ CHANGELOG.md pkg/@eserstack/fp/ pkg/@eserstack/standards/: "Finished in 72ms on 671 files" (466 .md, 186 .ts, 17 .json, 1 .yml, 1 .js; docs/api/ is gitignored and skipped). `--check` afterwards: all formatted (idempotent). `deno fmt --check` on the clean paths afterwards: 39 of 269 files not formatted, so the two formatters disagree and the switch is one reformat commit.

| type | files changed | + lines | - lines |
| --- | --- | --- | --- |
| .md | 409 | 2832 | 1053 |
| .ts | 61 | 992 | 894 |
| .json | 1 | 5 | 1 |
| .yml, .js | 0 | 0 | 0 |
| total | 471 | 3829 | 1948 |

By path: backlog/tasks 318 of 318 (+2327/-687), backlog/decisions 61 (+71/-105), backlog/docs 3 (+248/-114), backlog/milestones 8 (+8/-0), .agents 13 of 79 (+112/-85), docs 5 of 11 (+94/-80), CHANGELOG.md 1 (+5/-1), fp 24 of 115 (+120/-145), standards 38 of 74 (+844/-731).

Markdown changes in run A: blank lines added around Backlog.md's `<!-- SECTION/AC -->` markers and before a list after a paragraph (1748 lines in 338 files); frontmatter `'...'` to `"..."` (687 lines in 382 files); code reformatted inside fences (60 files); table padding (2 files, mostly ADR 0005's decision table); and content edits in backlog/: unescaped `import-protection/*` ... `vite/*` turned into `/_` ... `/_` (emphasis normalized) and `/_rsc` into `/\_rsc`.

TS changes are prettier against dprint layout, which no option closes: `collections.createMapBuilder<...>()\n.set(...)` chains break after the receiver; a trailing arrow argument hugs the call (`proc.stdout?.on("data", (chunk) =>\n stdoutChunks.push(chunk),\n);`); a conditional property value moves under its key (`env:\n options?.env !== undefined\n ? ...`); deno's broken `for (\n const x of ...\n)` headers are joined; `(x) => cond ? a : b` gets parentheses; return types of curried generics get parentheses. In code fences: `if (value === null) {}` becomes a two-line block, `return await response.json() as Manifest` becomes `(await response.json()) as Manifest`, template-literal interpolations re-break.

Variants over the same paths (files changed, +/-):
- A: 471, 3829/1948 (baseline).
- A + quoteProps preserve: 471, 3826/1945 (no real effect; deno also uses as-needed).
- A + proseWrap always (deno's default): 492, 15652/5214 (much worse: rewraps backlog, and .agents goes from 13 to 30 files because prettier and dprint wrap differently).
- A + embeddedLanguageFormatting off: 443, 2972/1166 (.agents from 13 to 2 files; but deno formats code fences today, so this is a policy change).
- Final, A + ignore backlog/ (and deno's other excludes): 81 files, 1175/1042 (.ts 61 +992/-894, .md 19 +178/-147, .json 1 +5/-1).

backlog/ should stay ignored: Backlog.md writes its own frontmatter (382 of 391 files share its single-quoted dates) and markers, so formatting it churns on every CLI edit; that removes 390 of the 471 files. TS: 61 of 186 sample files change (33%, about 8% of 22,926 lines). Whole repo with the final config: `oxfmt --list-different .` lists 697 files (657 of 1365 .ts, 23 .md, 10 .json, 5 .js, 1 .yml, 1 .html, 1 .css). Review by hand in the .agents code fences: trailing `;` after JSX expressions are dropped, and `"use client"; // after an import` becomes `("use client");`.

Conclusion: mechanical, CONFIRMED (deterministic, idempotent, about 70 ms, no TS semantics change). Small, REFUTED as stated (471 of 671 files on the five paths); CONFIRMED after scoping (backlog/ ignored, proseWrap preserve: 81 files). The real cost is the TS layout change, about 48% of TS files repo-wide, which fits one reformat commit (decision-19).

### (2) deno lint rules mapped to oxlint: 104 rules (not 105); 88 oxlint rules cover 89 of them; 15 gaps

`deno lint --rules --json` lists 124 rules; 87 are tagged recommended; the `include` list adds 18 more, one of which (no-const-assign) is already recommended: 87 + 18 - 1 = 104. The plan's 105 counts that rule twice. Only the root deno.json has `lint`; a probe confirmed its rules apply inside members. `deno lint .` checks 1371 files with 0 findings; the files carry 537 `deno-lint-ignore` line pragmas and 24 file pragmas: no-await-in-loop 206, no-explicit-any 199 (+1 file), no-top-level-await 73, no-console 24 (+21 file), no-control-regex 12, require-await 9, default-param-last 4, ban-types 3, no-external-import 2 (+2 file), require-yield 2, no-irregular-whitespace, prefer-const and no-throw-literal 1 each, no-undef and camelcase 1 file pragma each.

| deno rule | oxlint rule or GAP | note |
| --- | --- | --- |
| adjacent-overload-signatures | typescript/adjacent-overload-signatures | |
| ban-ts-comment | typescript/ban-ts-comment | allow-with-description, as deno |
| ban-types | typescript/ban-types | stricter: flags `Function` (3 in primitives/functions.ts) |
| ban-unknown-rule-code | option reportUnusedDisableDirectives | an unknown rule name is reported as an unused directive |
| ban-untagged-ignore | unicorn/no-abusive-eslint-disable | a bare `oxlint-disable-next-line` is flagged |
| ban-untagged-todo | GAP | validate-naming-and-todos (decision-34) |
| ban-unused-ignore | option reportUnusedDisableDirectives: error | |
| camelcase | GAP | validate-naming-and-todos (decision-34) |
| constructor-super | eslint/constructor-super | |
| default-param-last | eslint/default-param-last | weaker: misses a default followed by an optional `x?` (4 pragmas become unused) |
| eqeqeq | eslint/eqeqeq | |
| for-direction | eslint/for-direction | |
| getter-return | eslint/getter-return | |
| jsx-boolean-value | react/jsx-boolean-value | |
| jsx-button-has-type | react/button-has-type | |
| jsx-curly-braces | react/jsx-curly-brace-presence | |
| jsx-key | react/jsx-key | |
| jsx-no-children-prop | react/no-children-prop | stricter: also flags `children` in createElement props (5); decision-17 moves code to createElement, so consider turning it off |
| jsx-no-comment-text-nodes | react/jsx-no-comment-textnodes | |
| jsx-no-duplicate-props | react/jsx-no-duplicate-props | |
| jsx-no-unescaped-entities | react/no-unescaped-entities | |
| jsx-no-useless-fragment | react/jsx-no-useless-fragment | |
| jsx-props-no-spread-multi | react/jsx-props-no-spread-multi | |
| jsx-void-dom-elements-no-children | react/void-dom-elements-no-children | |
| no-array-constructor | eslint/no-array-constructor | |
| no-async-promise-executor | eslint/no-async-promise-executor | |
| no-await-in-loop | eslint/no-await-in-loop | stricter: a `for await` nested in a loop (2, codebase/package/workspace.ts:58,90) |
| no-await-in-sync-fn | GAP: parser | oxc: "`await` is only allowed within async functions"; tsc too |
| no-case-declarations | eslint/no-case-declarations | |
| no-class-assign | eslint/no-class-assign | |
| no-compare-neg-zero | eslint/no-compare-neg-zero | |
| no-cond-assign | eslint/no-cond-assign | |
| no-console | eslint/no-console | |
| no-const-assign | eslint/no-const-assign | |
| no-constant-condition | eslint/no-constant-condition | |
| no-control-regex | eslint/no-control-regex | |
| no-debugger | eslint/no-debugger | |
| no-delete-var | eslint/no-delete-var | |
| no-deprecated-deno-api | GAP: drop | Deno-only |
| no-dupe-args | GAP: parser | oxc: "Identifier `a` has already been declared" |
| no-dupe-class-members | eslint/no-dupe-class-members | |
| no-dupe-else-if | eslint/no-dupe-else-if | |
| no-dupe-keys | eslint/no-dupe-keys | |
| no-duplicate-case | eslint/no-duplicate-case | |
| no-empty | eslint/no-empty | |
| no-empty-character-class | eslint/no-empty-character-class | |
| no-empty-enum | GAP: TS option | no oxlint rule; erasableSyntaxOnly bans enums |
| no-empty-interface | typescript/no-empty-interface | |
| no-empty-pattern | eslint/no-empty-pattern | |
| no-eval | eslint/no-eval | |
| no-ex-assign | eslint/no-ex-assign | |
| no-explicit-any | typescript/no-explicit-any | |
| no-external-import | eslint/no-restricted-imports, regex `^(https?\|jsr\|npm):` | https: and jsr: flagged; deno also flags `node:`, so those pragmas become unused |
| no-extra-boolean-cast | eslint/no-extra-boolean-cast | |
| no-extra-non-null-assertion | typescript/no-extra-non-null-assertion | |
| no-fallthrough | eslint/no-fallthrough | |
| no-func-assign | eslint/no-func-assign | |
| no-global-assign | eslint/no-global-assign | |
| no-import-assertions | GAP: tsc | oxc accepts `assert {}`; tsc rejects import assertions |
| no-import-assign | eslint/no-import-assign | |
| no-inner-declarations | eslint/no-inner-declarations | |
| no-invalid-regexp | eslint/no-invalid-regexp | |
| no-invalid-triple-slash-reference | GAP: tsc | tsc reports unresolved references; 0 triple-slash references today |
| no-irregular-whitespace | eslint/no-irregular-whitespace | |
| no-misused-new | typescript/no-misused-new | |
| no-namespace | typescript/no-namespace | |
| no-new-symbol | eslint/no-new-native-nonconstructor | |
| no-non-null-asserted-optional-chain | typescript/no-non-null-asserted-optional-chain | |
| no-obj-calls | eslint/no-obj-calls | |
| no-octal | GAP: parser | oxc reports 0-prefixed octal literals |
| no-prototype-builtins | eslint/no-prototype-builtins | |
| no-redeclare | eslint/no-redeclare | stricter: a const and a type with one name (posts/adapters/bluesky/social-api.ts:426) |
| no-regex-spaces | eslint/no-regex-spaces | |
| no-self-assign | eslint/no-self-assign | |
| no-self-compare | eslint/no-self-compare | |
| no-setter-return | eslint/no-setter-return | |
| no-shadow-restricted-names | eslint/no-shadow-restricted-names | |
| no-sloppy-imports | GAP: tsc | nodenext rejects extensionless relative imports |
| no-sparse-arrays | eslint/no-sparse-arrays | |
| no-sync-fn-in-async-fn | GAP | node/no-sync is broader (any `*Sync` call, 42 findings); a small validator or drop |
| no-this-alias | typescript/no-this-alias | stricter: `receiver = this` (httpclient/h3-fetch.test.ts:50) |
| no-this-before-super | eslint/no-this-before-super | |
| no-throw-literal | eslint/no-throw-literal | |
| no-top-level-await | node/no-top-level-await | |
| no-undef | eslint/no-undef | nursery; needs env browser+node+worker and Deno/Bun globals, then 0; tsc covers it, can be dropped |
| no-unreachable | eslint/no-unreachable | |
| no-unsafe-finally | eslint/no-unsafe-finally | |
| no-unsafe-negation | eslint/no-unsafe-negation | |
| no-unused-labels | eslint/no-unused-labels | |
| no-unused-vars | eslint/no-unused-vars | `^_` ignore patterns |
| no-unversioned-import | GAP: drop | npm:/jsr: specifiers go; versions live in package.json |
| no-var | eslint/no-var | |
| no-window | eslint/no-restricted-globals (window) | 0 findings; unicorn/prefer-global-this is an alternative (7, also flags self/global) |
| no-window-prefix | eslint/no-restricted-globals (window) | same rule |
| no-with | eslint/no-with | |
| prefer-as-const | typescript/prefer-as-const | |
| prefer-const | eslint/prefer-const | |
| prefer-namespace-keyword | typescript/prefer-namespace-keyword | |
| require-await | eslint/require-await | not type-aware |
| require-yield | eslint/require-yield | |
| single-var-declarator | eslint/one-var ("never") | finds 1 deno misses inside an arrow body (jsx-runtime/encoder.ts:17) |
| use-isnan | eslint/use-isnan | |
| valid-typeof | eslint/valid-typeof | |
| verbatim-module-syntax | GAP: TS option | verbatimModuleSyntax (the current root tsconfig.json lacks it); typescript/consistent-type-imports has 13 findings |

Gaps (15): covered by oxlint options (2): ban-unknown-rule-code, ban-unused-ignore. Rejected by the oxc parser (3): no-await-in-sync-fn, no-dupe-args, no-octal. Covered by tsc or a TS option (5): no-import-assertions, no-invalid-triple-slash-reference, no-sloppy-imports, verbatim-module-syntax, no-empty-enum (erasableSyntaxOnly). Covered by validate-naming-and-todos (2): camelcase, ban-untagged-todo. Drop (2): no-deprecated-deno-api, no-unversioned-import. Real gap (1): no-sync-fn-in-async-fn: add a validator or drop it.

Finding counts with the draft config (1371 files, the same set as deno lint per `--debug=files`, 88 rules, about 0.12 s), (A) tree as is, where oxlint ignores the deno pragmas, and (B) after a scratch codemod of the 561 pragmas into `oxlint-disable`:

| rule | A | B |
| --- | --- | --- |
| typescript/no-explicit-any | 296 | 0 |
| eslint/no-await-in-loop | 208 | 2 |
| eslint/no-console | 179 | 0 |
| node/no-top-level-await | 77 | 0 |
| eslint/no-control-regex | 12 | 0 |
| eslint/require-await | 9 | 0 |
| typescript/ban-types | 6 | 3 |
| react/no-children-prop | 5 | 5 |
| eslint/require-yield | 2 | 0 |
| no-irregular-whitespace, prefer-const, no-throw-literal | 1 each | 0 |
| typescript/no-this-alias, eslint/one-var, eslint/no-redeclare | 1 each | 1 each |
| unused disable directives | n/a | 9 (4 default-param-last, 4 no-external-import on node: imports, 1 no-undef in a .js hook) |
| total | 800 | 22 |

All other mapped rules report 0. A first run with only env.builtin gave 4,039 no-undef findings (Deno 2,867, console 179, Response 160, ...); the draft's env and globals clear them. The 13 real findings after the codemod are oxlint being stricter, plus the one deno miss; each needs a fix, a pragma or a rule option in M1. The codemod prototype for M1-T3 maps no-explicit-any to typescript/no-explicit-any, no-top-level-await to node/no-top-level-await, ban-types to typescript/ban-types and no-external-import to eslint/no-restricted-imports, and turns the camelcase-only file pragma into a plain comment.

### Draft .oxfmtrc.json

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": false,
  "quoteProps": "as-needed",
  "trailingComma": "all",
  "arrowParens": "always",
  "bracketSpacing": true,
  "proseWrap": "preserve",
  "embeddedLanguageFormatting": "auto",
  "endOfLine": "lf",
  "insertFinalNewline": true,
  "sortPackageJson": false,
  "ignorePatterns": [
    ".claude/",
    "backlog/",
    "apps/",
    "docs/api/",
    "etc/temp/",
    "third-party/",
    ".eser/recipes/",
    "pnpm-lock.yaml",
    "pkg/@eserstack/cli/dist/",
    "pkg/@eserstack/noskills/dist/",
    "pkg/@eserstack/laroux-server/dist/"
  ]
}
```

### Draft .oxlintrc.json

The Deno and Bun globals are transitional and go with the runtimes; eslint/no-undef can be dropped if tsc is trusted for undefined names.

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["eslint", "typescript", "unicorn", "react", "node"],
  "categories": {
    "correctness": "off", "suspicious": "off", "pedantic": "off", "perf": "off",
    "style": "off", "restriction": "off", "nursery": "off"
  },
  "env": { "builtin": true, "es2024": true, "browser": true, "node": true, "worker": true },
  "globals": { "Deno": "readonly", "Bun": "readonly" },
  "options": { "reportUnusedDisableDirectives": "error" },
  "ignorePatterns": [
    ".claude/", "backlog/", ".git/", "apps/", "docs/", "etc/temp/", "third-party/",
    ".eser/recipes/", "node_modules/", "pkg/@eserstack/cli/dist/",
    "pkg/@eserstack/noskills/dist/", "pkg/@eserstack/laroux-server/dist/"
  ],
  "rules": {
    "eslint/constructor-super": "error",
    "eslint/default-param-last": "error",
    "eslint/eqeqeq": "error",
    "eslint/for-direction": "error",
    "eslint/getter-return": "error",
    "eslint/no-array-constructor": "error",
    "eslint/no-async-promise-executor": "error",
    "eslint/no-await-in-loop": "error",
    "eslint/no-case-declarations": "error",
    "eslint/no-class-assign": "error",
    "eslint/no-compare-neg-zero": "error",
    "eslint/no-cond-assign": "error",
    "eslint/no-console": "error",
    "eslint/no-const-assign": "error",
    "eslint/no-constant-condition": "error",
    "eslint/no-control-regex": "error",
    "eslint/no-debugger": "error",
    "eslint/no-delete-var": "error",
    "eslint/no-dupe-class-members": "error",
    "eslint/no-dupe-else-if": "error",
    "eslint/no-dupe-keys": "error",
    "eslint/no-duplicate-case": "error",
    "eslint/no-empty": "error",
    "eslint/no-empty-character-class": "error",
    "eslint/no-empty-pattern": "error",
    "eslint/no-eval": "error",
    "eslint/no-ex-assign": "error",
    "eslint/no-extra-boolean-cast": "error",
    "eslint/no-fallthrough": "error",
    "eslint/no-func-assign": "error",
    "eslint/no-global-assign": "error",
    "eslint/no-import-assign": "error",
    "eslint/no-inner-declarations": "error",
    "eslint/no-invalid-regexp": "error",
    "eslint/no-irregular-whitespace": "error",
    "eslint/no-new-native-nonconstructor": "error",
    "eslint/no-obj-calls": "error",
    "eslint/no-prototype-builtins": "error",
    "eslint/no-redeclare": "error",
    "eslint/no-regex-spaces": "error",
    "eslint/no-restricted-globals": ["error", { "name": "window", "message": "Use globalThis (deno no-window, no-window-prefix)." }],
    "eslint/no-restricted-imports": ["error", { "patterns": [{ "regex": "^(https?|jsr|npm):", "message": "Import a package name, not a URL or runtime-specific specifier (deno no-external-import)." }] }],
    "eslint/no-self-assign": "error",
    "eslint/no-self-compare": "error",
    "eslint/no-setter-return": "error",
    "eslint/no-shadow-restricted-names": "error",
    "eslint/no-sparse-arrays": "error",
    "eslint/no-this-before-super": "error",
    "eslint/no-throw-literal": "error",
    "eslint/no-undef": "error",
    "eslint/no-unreachable": "error",
    "eslint/no-unsafe-finally": "error",
    "eslint/no-unsafe-negation": "error",
    "eslint/no-unused-labels": "error",
    "eslint/no-unused-vars": ["error", { "varsIgnorePattern": "^_", "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_", "destructuredArrayIgnorePattern": "^_" }],
    "eslint/no-var": "error",
    "eslint/no-with": "error",
    "eslint/one-var": ["error", "never"],
    "eslint/prefer-const": "error",
    "eslint/require-await": "error",
    "eslint/require-yield": "error",
    "eslint/use-isnan": "error",
    "eslint/valid-typeof": "error",
    "typescript/adjacent-overload-signatures": "error",
    "typescript/ban-ts-comment": ["error", { "ts-expect-error": "allow-with-description", "ts-ignore": "allow-with-description", "ts-nocheck": "allow-with-description", "ts-check": false }],
    "typescript/ban-types": "error",
    "typescript/no-empty-interface": "error",
    "typescript/no-explicit-any": "error",
    "typescript/no-extra-non-null-assertion": "error",
    "typescript/no-misused-new": "error",
    "typescript/no-namespace": "error",
    "typescript/no-non-null-asserted-optional-chain": "error",
    "typescript/no-this-alias": "error",
    "typescript/prefer-as-const": "error",
    "typescript/prefer-namespace-keyword": "error",
    "unicorn/no-abusive-eslint-disable": "error",
    "node/no-top-level-await": "error",
    "react/button-has-type": "error",
    "react/jsx-boolean-value": "error",
    "react/jsx-curly-brace-presence": "error",
    "react/jsx-key": "error",
    "react/jsx-no-comment-textnodes": "error",
    "react/jsx-no-duplicate-props": "error",
    "react/jsx-no-useless-fragment": "error",
    "react/jsx-props-no-spread-multi": "error",
    "react/no-children-prop": "error",
    "react/no-unescaped-entities": "error",
    "react/void-dom-elements-no-children": "error"
  }
}
```

## Items 3, 4 and 9: TypeScript 7 (2026-10-24)

Versions: `typescript@7.0.2`, the native compiler under the plain `typescript` name (dist-tags: latest 7.0.2, rc 7.0.1-rc, beta 7.1.0-beta; the binary comes from `@typescript/typescript-<platform>@7.0.2`; `@typescript/native-preview` is the old preview name), pinned exactly. Node v26.12.1, pnpm 11.18.0 (the 26.12.1 bin dir has no pnpm shim; corepack's shim ran it on 26.12.1), `@types/node@26.6.1`, `@types/deno@2.7.0` (local Deno is 2.9.6), `typescript@5.9.3` only as a second consumer check. All work ran in a scratch copy; raw tsc outputs were kept in the scratch dir (run1, baseline, no-isodecl, lib-esnext, no-skiplib).

### (3) TypeScript 7.0.2 options: CONFIRMED, with one extra option

Under module and moduleResolution nodenext with noEmit, a fixture importing `./util.ts`, a type-only import, and `import data from "./a.json" with { type: "json" }` checks clean with allowImportingTsExtensions, erasableSyntaxOnly, verbatimModuleSyntax, resolveJsonModule and isolatedDeclarations, once `declaration: true` is added: without it tsc reports `TS5069: Option 'isolatedDeclarations' cannot be specified without specifying option 'declaration' or option 'composite'` even under noEmit. The control without allowImportingTsExtensions gives TS5097. A negative fixture shows each option enforced: TS1484 (verbatimModuleSyntax), TS1543 (JSON import without the attribute under NodeNext), TS1294 twice (enum and parameter property under erasableSyntaxOnly), TS9013 (an exported function without a return type under isolatedDeclarations).

Emit: with `rewriteRelativeImportExtensions: true`, without allowImportingTsExtensions, plus declaration, rootDir and outDir, tsc exits 0, rewrites `./util.ts` to `./util.js` in the JS, keeps the JSON import attribute and copies a.json to dist; `node -e 'import("./dist/main.js")...'` runs. The .d.ts files keep `.ts` specifiers, which TS 7.0.2 and 5.9.3 consumers both resolve (item 4).

### (4) tsc 7 emit, pnpm pack and install: CONFIRMED (standards needs isolatedDeclarations off for emit until fixed)

fp depends on @eserstack/primitives (`workspace:*`), so primitives was built and packed too, each with a per-package tsconfig.build.json (draft below) and, in the scratch copy, `"files": ["dist", "README.md"]` plus `publishConfig.exports` mapping every `./x.ts` export to `{ "types": "./dist/x.d.ts", "default": "./dist/x.js" }` (generated by a small script).

- primitives: exit 0 (7 .js, 7 .d.ts). fp: exit 0 (52 .js, 52 .d.ts).
- standards with isolatedDeclarations on: exit 1, 25 TS90xx errors, and tsc 7 still wrote all 44 .js but silently dropped 5 .d.ts (cross-runtime/adapters/server-websocket, cross-runtime/adapters/shared, formatters/format-percent, logging, patterns). With `--isolatedDeclarations false`: exit 0 (44 .js, 44 .d.ts). So the build must fail on a non-zero exit, or a package ships without some declarations.
- All 117 relative specifiers in the emitted .js end in .js (the dynamic `import("./adapters/deno.js")` included); all 103 in the .d.ts end in .ts. fp's imports of @eserstack/primitives stay bare. No Deno.* type leaks into the .d.ts.

`pnpm pack`: fp has 211 entries (package.json, README.md, LICENSE, dist/**). `workspace:*` becomes the exact version with no caret, in dependencies (`"@eserstack/primitives": "4.5.2"`) and in devDependencies too (`"@eserstack/test-kit": "4.5.2"`, a private package: harmless for consumers, noise in the manifest). `publishConfig.exports` replaces the top-level exports and publishConfig is removed. `npm:` aliases pass through unchanged (standards: `"@std/fs": "npm:@jsr/std__fs@^1.0.24"`, `@std/path`, `@std/semver`).

Consumer (outside the copy; deps on @eserstack/fp and @eserstack/standards 4.5.2; pnpm overrides to `file:` tarballs for fp, standards and primitives; `.npmrc` with `@jsr:registry=https://npm.jsr.io` for the @std aliases): `pnpm install` OK; `node consumer.ts` importing `@eserstack/fp`, `@eserstack/standards` and `@eserstack/standards/cross-runtime` printed `{"pages":[[1,2],[3,4],[5]],...,"runtime":"node","platform":"darwin"}`, exit 0. tsc 7.0.2 (skipLibCheck false) checks it clean with and without allowImportingTsExtensions; a probe with two deliberate type errors gets exactly those two (TS2322 twice) from TS 7.0.2 and 5.9.3, so the types behind the .ts specifiers in the .d.ts resolve. No fallback emitter is needed; if one ever is, tsdown (oxc isolated declarations, same annotations needed) or tsc 5.9 for declarations only. declarationMap and sourceMap point at sources that are not in the tarball: ship the sources or drop the maps.

### (9) tsc 7 baseline error count: 103 errors, one root config, nothing blocked

One root tsconfig.json (draft below) over `pkg/@eserstack/*/**/*.ts` and `etc/scripts/**/*.ts`, `.eser/recipes` excluded: 1,393 files, 0.55 to 0.58 s wall (2.3 to 2.5 s user). Workspace packages resolve through pnpm links to their .ts export targets; no project references needed.

- With `types: ["node"]` only: 3,017 errors (TS2304 2,874, all "Cannot find name 'Deno'", across 333 files; TS2503 7 "namespace 'Deno'").
- Baseline with `types: ["node", "deno"]` and @types/deno 2.7.0: 103 errors: TS9013 33, TS9010 21, TS2339 13, TS9038 9, TS9017 6, TS9012 5, TS7016 5, TS9007 4, TS9008 3, TS2307 3, TS9011 1.
- isolatedDeclarations false: 21 (so 82 of the 103 are isolatedDeclarations annotations, which overlap JSR's no-slow-types rule). lib without dom: 295 (laroux-react, webtransport, noskills-web and noskills-client need dom). skipLibCheck false: 110 (+7 TS2307 inside @tailwindcss/node@4.3.3 dist/index.d.ts).

| package | errors | top codes |
| --- | --- | --- |
| standards | 25 | TS9038 9, TS9012 4, TS9017 4, TS9010 3, TS9013 3, TS9011 1, TS2339 1 |
| posts | 17 | TS9013 17 |
| kit | 15 | TS2339 12, TS9010 2, TS9017 1 |
| laroux-bundler | 9 | TS9013 9 |
| noskills | 6 | TS9010 6 |
| fp | 5 | TS7016 5 |
| jsx-runtime | 4 | TS9010 3, TS9007 1 |
| bundler | 4 | TS9013 4 |
| app-runtime | 4 | TS9008 3, TS9012 1 |
| collector | 3 | TS9007 3 |
| etc/scripts | 2 | TS2307 2 |
| config | 2 | TS9010 1, TS9017 1 |
| codebase | 2 | TS9010 2 |
| streams | 1 | TS9010 1 |
| shell | 1 | TS9010 1 |
| noskills-web | 1 | TS9010 1 |
| cli | 1 | TS9010 1 |
| ajan | 1 | TS2307 1 |
| total | 103 | |

The other 29 workspace packages have 0 errors. The 21 non-isolatedDeclarations errors: TS2339 13 are `ReadableStream.from`, which Deno's lib has and TS 7's lib.dom lacks (12 in kit tests, 1 in standards' web-streams.test.ts; a small global augmentation or a helper fixes them); TS7016 5 are fp `*.bench.ts` importing untyped `lodash.*` (add @types/lodash.* or exclude benches); TS2307 3 are `bun:ffi` in ajan/ffi/backend-bun.ts and etc/scripts/ffi-client.template.ts importing `@eserstack/ajan/ffi` with no root link (a template: exclude it or add the dependency). There are no .tsx files under pkg/ or etc/scripts, and no `npm:`/`jsr:` import specifiers in source (only string data in laroux-bundler import-map tests). An alternative to @types/deno is checked-in `deno types` output, which matches Deno 2.9.6 better; it is needed only until the Deno references are gone.

### Draft tsconfig.json (root, check only)

```json
{
  "compilerOptions": {
    "target": "esnext",
    "lib": ["esnext", "dom"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node", "deno"],
    "noEmit": true,
    "declaration": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "isolatedDeclarations": true,
    "strict": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true
  },
  "include": ["pkg/@eserstack/*/**/*.ts", "etc/scripts/**/*.ts"],
  "exclude": ["**/node_modules", "pkg/@eserstack/*/dist", ".eser/recipes"]
}
```

Root devDependencies: `"typescript": "7.0.2"` and `"@types/deno": "2.7.0"` (the latter until the Deno references are gone), next to @types/node.

### Draft tsconfig.build.json (per package, emit)

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "allowImportingTsExtensions": false,
    "rewriteRelativeImportExtensions": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["**/*.ts"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "**/*.bench.ts", "**/testdata"]
}
```

Pairs with `"files": ["dist", "README.md"]` and `publishConfig.exports` (one `{ types, default }` entry per source export) in each package.json. For standards, add `"isolatedDeclarations": false` until its 25 annotations are fixed.

## Items 5, 6, 8 and 10 (2026-10-24)

Versions: Node v26.12.1, npm 11.20.0, Go 1.26.6 darwin/arm64, `@std/assert` as `npm:@jsr/std__assert@1.0.19` and `@std/testing` as `npm:@jsr/std__testing@1.0.20` (through `@jsr:registry=https://npm.jsr.io`), jsr npm CLI `jsr@0.14.3` (downloads Deno 2.6.7), `semver@7.7.2` for the registry timing. Fixtures lived in a scratch directory; nothing in the repo changed, nothing was published, no token was used.

### (5) @std/assert and @std/testing/mock under node --test with node:test describe/it: CONFIRMED, with caveats

`node --test tests/std.test.ts` (no loader, built-in type stripping) ran assertEquals (with a Map), assertThrows, assertRejects, spy/assertSpyCalls, stub/restore and `using` with stub inside describe/it: 6 pass, 0 fail, exit 0. The @jsr packages ship compiled .js, so Node never strips types inside node_modules.

The repo's test-kit assert.ts, mock.ts and capture.ts (byte-identical copies) run unchanged when imported by relative path or as `@eserstack/test-kit/*` through a symlinked workspace link (Node resolves the realpath outside node_modules). From an installed tarball they fail with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, so test-kit works only as a workspace link or after a .js build. The repo's own assert.test.ts fails only on `Deno is not defined` (Deno.test).

Semantic differences from Deno:
1. No leak sanitizers. A leaked setInterval does not fail the test; it hangs the file (default --test-timeout is 0; `timeout 15` killed it with 124, also with --test-isolation=none). `--test-force-exit` ends it at once, so CI needs it.
2. Async errors after a test ends print "generated asynchronous activity after the test ended" and do not fail the run or change the exit code.
3. std diffs are always colored: @std/internal/styles.js reads only Deno.noColor, so NO_COLOR=1 and piped stdout still get ANSI codes.
4. Failures show as `Error [AssertionError]` with std's diff and stacks into node_modules/@std/...js.
The test-kit range `^1.0.20` resolved to 1.0.21 under npm while the repo lock has 1.0.20; pin exactly if it matters.

### (6) node --test discovery, process per file, LCOV: CONFIRMED

- Default discovery (`node --test` with no args) found `pkg/@x/a/math.test.ts`, `pkg/@x/b/sub/deep.test.ts`, `pkg/@x/c/underscore_test.ts` and `test/in-test-dir.ts`, and skipped node_modules and a plain helper. It also matches `*-test.*`, `*_test.*`, `test-*.*`, `test.*` and anything under `test/` (a helper named `not-a-test.ts` was picked up), so the scripts must pass an explicit glob. The repo has one `test/` dir (.eser/recipes/cf-workers-app/test).
- `node --test "pkg/**/*.test.ts"` found 2 files and excluded node_modules even under the explicit glob; brace patterns (`"pkg/**/*{.,_}test.ts"`) work.
- One process per file by default (`--test-isolation=process`): a distinct pid per file with the same parent; `--test-isolation=none` runs every file in the runner's process; `--test-concurrency=1` keeps one pid per file and runs them serially.
- `.tsx` cannot load: `ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".tsx"`, even without JSX. The repo has 420 `*.test.ts` under pkg/ and 0 `*.test.tsx`, but 9 .tsx files under pkg/ and .eser/ (including .eser/recipes/jsx-runtime-app/root.test.tsx); a test that imports a .tsx module needs a loader.
- LCOV: `node --test --experimental-test-coverage --test-reporter=spec --test-reporter-destination=stdout --test-reporter=lcov --test-reporter-destination=out/lcov.info "pkg/**/*.test.ts"` printed the coverage table and wrote SF/FN/FNDA/BRDA/DA/LH/LF records. `--test-coverage-include-all --test-coverage-include="pkg/**" --test-coverage-exclude="**/*.test.ts"` adds untested source files (LH:0). Coverage is still `--experimental-test-coverage`; thresholds are `--test-coverage-lines/branches/functions`; `--test-shard`, `--test-global-setup`, `--test-timeout` and `--test-force-exit` exist.

### (8) Does `npx jsr publish` download Deno: CONFIRMED, it does

jsr@0.14.3 source: `publish` runs `process.env.DENO_BIN_PATH ?? getOrDownloadBinPath(...)`, which downloads a pinned Deno v2.6.7 (`https://dl.deno.land/release/v2.6.7/deno-aarch64-apple-darwin.zip`, sha256-checked per platform) into `<jsr package>/.download/<version>/<platform>/deno`, removing the folder before each download, then runs `deno publish --unstable-bare-node-builtins --unstable-sloppy-imports --unstable-byonm --no-check ...` (the four flags when a package.json is present). A deno on PATH is ignored; only DENO_BIN_PATH counts; DENO_BIN_CANARY takes the latest canary without the hash check.

`npx --yes jsr@0.14.3 publish --dry-run` with a fresh npm cache and no deno on PATH printed "Downloading JSR release binary... Download completed ... Simulating publish of @t175-scratch/tiny@0.0.1 ... Success Dry run complete" in about 5 s cold. The zip is 41,456,547 bytes and unpacks to a 93,804,368-byte binary under `~/.npm/_npx/<hash>/node_modules/jsr/.download/v2.6.7/darwin/deno`; a second run in the same cache did not download. With `DENO_BIN_PATH=/opt/homebrew/bin/deno` and a fresh cache the dry run succeeded with no download. Conclusion: publishing to JSR from an npm-only toolchain still pulls Deno (a pinned 2.6.7, older than the local 2.9.6) on every runner without a cached npx dir, unless DENO_BIN_PATH points at an installed Deno. --dry-run needs no token.

### (10) npx from inside a native binary started by an npm launcher: CONFIRMED

Setup: `t175-target@1.2.3` (a bin printing its version) and `t175-launcher@0.1.0`, whose bin spawns a 2.8 MB Go binary with stdio inherited and forwards its exit code; both installed from `npm pack` tarballs (the binary's exec bit survived). The Go child runs and times `npx --yes ...`.

Timings (wall time per exec inside the Go child, median of 5; the machine was noisy, about ±80 ms):
- npx launcher -> native -> `npx --yes t175-target --version` with the target installed in the project: 167 ms (repeat rounds 172 and 184 ms; with the launcher run directly 166 and 175 ms).
- native -> `npx --yes --package=<tgz> t175-target --version`: cold (fresh caches) 536 to 621 ms; warm 494 ms; under an npx-started launcher with a fresh cache 684 ms.
- public registry `semver@7.7.2`: cold 631 to 773 ms; warm pinned 278 ms; warm unpinned 271 ms; warm pinned with --prefer-offline 212 ms.
- running the bin directly: 38 ms (`node bin.js` 33 ms; the cached semver bin 32 ms).

Every run printed the version with no error, nested npx included. Under an npx-started launcher the child sees `npm_command=exec`, `npm_execpath`, `npm_node_execpath`, `NODE`, `INIT_CWD`, the `npm_config_*` set (prefix, userconfig, globalconfig, local_prefix, user_agent, npm_version, plus user-set config), `npm_lifecycle_event=npx`, `npm_lifecycle_script`, `npm_package_json`, `npm_package_name`, `COLOR=0`, and a PATH with every ancestor's node_modules/.bin prepended (the project's twice). A direct launch passes none of these.

Conclusion for npx-noskills-hooks: npx works from inside the binary, but each hook routed through npx costs about 140 to 250 ms warm and up to about 0.7 s cold over a direct bin call (about 35 ms). The binary should resolve and exec the bin itself and keep npx as a fallback, and must not rely on the npm_* variables.

## Item 7: node:ffi against libeser_ajan (2026-10-24)

Environment: Node v26.12.1 on both platforms. macOS: Darwin 27.0.0, Apple M4 Max (16 CPUs), Go 1.26.6 darwin/arm64, library built with `make ajan-lib` in a scratch copy. Linux: Docker 29.5.2, VM with 8 CPUs, kernel 6.8.0-117 aarch64; runtime image `node:26.12.1` (linux/arm64, Debian 13 trixie, glibc 2.41), build image `golang:1.26.6` (linux/arm64), library built inside it with `make ajan-lib` (TARGET=aarch64-linux). node:ffi is on by default: no flag is needed, `--no-experimental-ffi` turns it off (`ERR_UNKNOWN_BUILTIN_MODULE`), the first use prints "ExperimentalWarning: FFI is an experimental feature", and under `--permission` dlopen throws `ERR_ACCESS_DENIED` until `--allow-ffi` is given.

Throwaway prototype (scratch copy only, spike_dispatch.go): `EserAjanCall(name, argsJSON *C.char) *C.char` decodes a JSON string array and returns `callRegistered(name, args)` (or `{"error":...}`), freed with EserAjanFree; a registered `spikeSleep(millis, token)` that blocks on time.After or a per-token channel; `EserAjanSpikeCancel(token)`. A variant built without pin_image_posix.go (the RTLD_NODELETE constructor) tested pinning.

### (7a) Load, handshake, one dispatcher call: CONFIRMED (AC #6)

```js
import ffi from 'node:ffi';
export function open(path = process.env.AJAN_LIB) {
  const { lib, functions: f } = ffi.dlopen(path, {
    EserAjanVersion: { arguments: [], return: 'pointer' },
    EserAjanFree: { arguments: ['pointer'], return: 'void' },
    EserAjanCall: { arguments: ['string', 'string'], return: 'pointer' },
    EserAjanSpikeCancel: { arguments: ['string'], return: 'void' },
  });
  const take = (p) => { const s = ffi.toString(p); f.EserAjanFree(p); return s; }; // read the C string, free it in Go
  return { lib, version: () => take(f.EserAjanVersion()),
    call: (name, args = []) => take(f.EserAjanCall(name, JSON.stringify(args))),
    cancel: (t) => f.EserAjanSpikeCancel(t), close: () => lib.close() };
}
```

Output, macOS (Linux identical except `linux arm64 suffix so` and dlopen 2.91 ms):
```
node v26.12.1 darwin arm64 suffix dylib
dlopen ms 2.40
EserAjanVersion -> eser-ajan version 4.5.2
EserAjanCall(formatEncode) -> {"result":"a: 1\n"}
EserAjanCall(version) -> eser-ajan version 4.5.2
EserAjanCall(nope) -> {"error":"unknown function: nope"}
EserAjanCall(formatEncode, no args) -> {"error":"formatEncode takes 1 argument(s) (requestJSON), got 0"}
misdeclared {result:"pointer"} returns undefined
exit=0
```
node:ffi ignores unknown signature keys: a misspelled `result: 'pointer'` declares a void function that returns undefined, so the binding needs a test that checks the declared signatures.

### (7b) The worker-thread pattern: CONFIRMED (AC #7)

A node:worker_threads worker opens the library with its own dlopen and answers `{id, name, args}` by postMessage (posting "started" first for spikeSleep).

| measurement | macOS | Linux |
| --- | --- | --- |
| main thread, dispatcher `version` | 1,573,655 calls/s | 1,233,297 calls/s |
| main thread, dispatcher `formatEncode` | 229,078 calls/s | 185,182 calls/s |
| main thread, direct EserAjanVersion export | 4,424,175 calls/s | 3,198,498 calls/s |
| inside a worker, dispatcher `version` loop | 1,444,830 calls/s | 1,114,592 calls/s |
| main to worker round trip, sequential await | 51,460 calls/s | 20,260 calls/s |
| main to worker, 20,000 pipelined | 525,787 calls/s | 490,036 calls/s |
| timer lateness (setInterval 10 ms), idle, max / p99 | 2.07 / 2.07 ms | 5.40 / 5.40 ms |
| timer lateness while 8 workers block 1 s, max / p99 | 2.82 / 2.82 ms | 5.28 / 5.28 ms |
| fs.promises.readFile of 8 MiB, median, idle / 8 workers blocked | 1.08 / 0.84 ms | 2.40 / 5.93 ms (max 17.8) |
| the 8 parallel spikeSleep(1000) calls, elapsed | 1001.9 to 1002.1 ms | 1007.5 to 1008.7 ms |
| control: main thread itself blocked 1 s, max lateness | 999.79 ms | 998.08 ms |
| main-thread EserAjanSpikeCancel until the blocked worker's reply arrives (n=30) | p50 0.105 ms, max 0.249 ms | p50 0.366 ms, max 0.644 ms |

The dispatcher costs about 2.6 to 2.8 times a direct export (JSON argument packing and the registry lookup) and still runs above 1M calls/s. Blocked workers do not touch the main loop or the libuv threadpool. The cancel test shows the main thread's and the worker's handles reach the same Go image and globals.

Second dlopen and pinning (10 cycles per mode on macOS, 5 on Linux): with the shipped pinned library every mode exits 0 on both OSes (main and worker both open; worker-only with close; worker-only without close; main closes and reopens 10 times). Without the pin on macOS, worker-only-close and worker-only-noclose hang in all 5 runs: the first worker.terminate() after the last handle goes away never returns, the process spins in state R and ignores SIGTERM, and `sample` shows the Go threads running in "<unknown binary>" (the image was unloaded); Node dlcloses the library at worker teardown even when the worker never calls close(). On Linux the Go linker already marks c-shared output NODELETE (`readelf -d`: FLAGS_1 NODELETE), so the pin changes nothing there. node:ffi has no dlopen-flags option (DynamicLibrary takes a path; its second argument is an internal VFS binary), so the library's own eserAjanPinImage constructor (RTLD_NOLOAD|RTLD_NODELETE) must stay. worker.terminate() during a blocked Go call took 2981.9 ms (macOS) and 2991.4 ms (Linux): it waits for the native call, so only a Go-side cancel interrupts it.

### (7c) Teardown: CONFIRMED, no signal (AC #8)

Each mode dlopens and calls formatEncode on the main thread, then: natural (falls off the end); worker (a worker dlopens, calls, returns, then main exits); exit (process.exit(0), mirroring exitCli in pkg/@eserstack/codebase/cli-support.ts and runtime.process.exit in pkg/@eserstack/workflows/main.ts); the -busy variants make 50k formatEncode calls just before exit so Go's GC is active; exit-worker-blocked hard-exits while a worker sits in spikeSleep(5000); the -cancel variant cancels the token in a process.on('exit') hook first. Exit codes, signals (negative return codes) and stderr markers (fatal error, SIGSEGV, SIGBUS, morestack, panic) were counted:

| mode | macOS | Linux |
| --- | --- | --- |
| natural | exit 0 x100 | exit 0 x100 |
| worker | exit 0 x100 | exit 0 x100 |
| exit (process.exit(0)) | exit 0 x100 | exit 0 x100 |
| natural-busy | exit 0 x50 | exit 0 x100 |
| exit-busy | exit 0 x50 | exit 0 x100 |
| exit-worker-blocked-cancel | exit 0 x100 | exit 0 x100 |
| exit-worker-blocked | exit 0 x20 | exit 0 x20 |

No signal and no marker in 1,040 runs on macOS and 1,220 on Linux: the Deno teardown SIGSEGV does not reproduce on Node, with or without the hard exits. The cost instead: with a worker blocked in Go, exit waits for that call (process.exit(0): 5056 / 5041 ms; natural exit with the worker unref()'d: 5054 / 5034 ms); cancelling in-flight tokens in an exit hook first: 75 / 57 ms.

### (7d) stdin, raw mode and SIGWINCH shared between Go and Node: PARTIAL (AC #9)

Go side: KeypressReader in pkg/ajan/shellfx/tui/tui.go (a goroutine doing a blocking os.Stdin.Read), SetStdinRaw (term.MakeRaw), the SIGWINCH handler in sigwinch_unix.go (signal.Notify until close, then signal.Stop). The dispatcher already registers shellTuiKeypressCreate/Read/Close, shellTuiSetStdinRaw and shellTuiGetSize (bridge_shell.go); the TS consumer is pkg/@eserstack/shell/tui/keypress-go.ts.

The pty driver (python pty.fork, TIOCSWINSZ via fcntl.ioctl) waits for READY, types a..j, resizes to 30x100 (the kernel sends SIGWINCH) and 40x120 (plus an explicit SIGWINCH), sends SIGUSR2 (the script then calls shellTuiKeypressClose on the main thread and times it), types k..o, resizes to 25x90, and kills a hung child at the deadline. The node script opens the library, optionally creates the Go reader (a worker loops shellTuiKeypressRead and posts events), optionally calls process.stdin.setRawMode(true) and listens for data, listens for process.stdout resize, and records the longest event-loop gap with a 10 ms heartbeat.

```
node-only            node "abcdefghijklmno" | go "" | node resize [100x30,120x40,90x25] | gap 12.2 ms
go-first-node-reads  macOS: READY never printed; main thread hung in uv_tty_init -> uv__dup2_cloexec -> dup2 (killed)
                     Linux: node "bcdefghijklmno" | go "a" | node resize [100x30,120x40] | go resize [] | gap 15.9 ms
go-first-go-raw-node-reads  macOS: READY at 9996 ms (main blocked until the first key);
                     node "bcdefghijklmno" | go "a" | node resize [100x30,120x40] | go resize [] | gap 9993.5 ms
                     Linux: same split, no stall, gap 13.2 ms
node-first-both-read node "abcdefghijklmno" | go "" | node resize [90x25] | go resize [100x30,120x40,120x40]
                     | KeypressClose 0.2 ms (Linux 0.6 ms) | gap 11.7 ms
go-only              node "" | go "abcdefghijk" | node resize [90x25] | go resize [100x30,120x40]
                     | KeypressClose 804.0 ms on the main thread (Linux 823.5) | gap 812.5 ms
go-only-resize-first as go-only; KeypressClose 801.6 ms (Linux 807.2)
```
setRawMode(true) reported isRaw = true in every scenario that reached it.

Findings:
1. One stdin owner at a time. When Node first touches process.stdin on a TTY, libuv reopens the tty and dup2s it onto fd 0 with O_NONBLOCK; Go's os.Stdin, opened blocking and non-pollable at library load, then gets EAGAIN and its readLoop ends with no error event (Go keeps at most the one key its in-flight read held). On macOS that dup2 blocks Node's main thread until Go's in-flight read returns: a hard hang in canonical mode, until the next key in raw mode (about 10 s here). Linux does not block. When Go owns stdin and Node never touches process.stdin, Go gets every key.
2. Raw mode works from either side (Node's setRawMode, Go's SetStdinRaw); they share no state, and Node's isRaw does not know about Go's raw mode.
3. SIGWINCH: the last installer wins, and Go does not forward async signals. Node installs its handler when process.stdout is first touched; Go's Notify then takes the signal (Go got 100x30 and 120x40, Node nothing). signal.Stop restores the handler that was installed when Notify ran: if Node's came first, Node gets resizes again after close (90x25 arrived); if Node installed its handler after Go's Notify, Node owns resizes while Go is active and Go's close restores SIG_DFL, so Node never gets another resize (90x25 lost on both OSes).
4. shellTuiKeypressClose blocks its caller until the next byte, bounded by closeWaitTimeout (2 s), because stdin is not pollable and SetReadDeadline fails: 804 to 823 ms on the main thread here. It belongs in a worker or behind a cancel path.

### Verdict (recorded in decision-37)

The node:ffi dispatcher and worker design holds on macOS arm64 and Linux arm64 with Node 26.12.1 (7a, 7b, 7c), with four constraints, each with a workaround: keep the macOS pin (pin_image_posix.go) and test it; give every blocking export a Go-side cancel and cancel open tokens in an exit hook (5 s exit to 57-75 ms); pin the node:ffi signatures in a test; one terminal owner per process (7d). Two shared-terminal cases can only be avoided, not worked around: Go's keypress reader and Node's process.stdin cannot both read one TTY (initialising Node's stdin while the Go reader is active can hang the main thread on macOS, and the Go reader then dies silently on both OSes), and Go's SIGWINCH and Node's resize cannot both receive events. Both come from libuv's reopen-and-dup2 of the tty and Go's c-shared signal handling, not from node:ffi or the worker design; under Node either the Go reader owns the terminal and Node never touches process.stdin, or the TUI keypress path becomes Node-native instead of keypress-go.ts.
<!-- SECTION:NOTES:END -->
