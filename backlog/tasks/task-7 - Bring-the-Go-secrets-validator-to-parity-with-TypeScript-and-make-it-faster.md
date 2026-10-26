---
id: TASK-7
title: Bring the Go secrets validator to parity with TypeScript and make it faster
status: Done
assignee: []
created_date: '2026-09-17 17:25'
updated_date: '2026-09-17 17:47'
labels:
  - ajan
  - codebase
  - performance
dependencies: []
references:
  - pkg/ajan/codebasefx/validators.go
  - pkg/@eserstack/codebase/validate-secrets.ts
  - pkg/@eserstack/codebase/file-tool.ts
priority: medium
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured on 2026-09-17 over this repo (2025 files): validate-secrets takes 530 ms through the Go FFI validator and 146 ms in the TypeScript implementation, while validate-eof and validate-licenses are 1.5-2x faster in Go. Two defects, one performance and one correctness. Performance: ValidateSecrets in pkg/ajan/codebasefx/validators.go runs three whole-file regexes per file, the third being (?i)(password|secret|api_key|token)\s*[=:]\s*["']?[^\s"']{8,}, which is the worst shape for Go's linear-time RE2 engine (case-insensitive alternation, no literal prefix, unbounded tail); and for every match it recomputes the line number with strings.Count(text[:match[0]], "\n"), a rescan from the start of the file per finding. Correctness: the Go validator reports 84 findings where TypeScript reports 2, because the exclude list from .eser/manifest.yml (.claude/skills/, .agents/skills/, whose security rules teach by counter-example) never reaches secretsSkipFile. Precommit runs the Go path, --fix runs the TypeScript path, so the gate and the fixer disagree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 validate-secrets through the Go validator honours the same exclude options as the TypeScript tool and reports the same findings on this repository (2 today), with a test that runs both implementations on one fixture tree and asserts identical results
- [x] #2 ValidateSecrets scans line by line: a cheap case-insensitive keyword pre-check (password, secret, api_key, token, AKIA, BEGIN) skips files and lines that cannot match before any regex runs, and line numbers come from the loop counter, not from strings.Count over a prefix
- [x] #3 Go validate-secrets on this repository is at least as fast as the TypeScript implementation (benchmark: warm run over 2025 files, both paths in one process, recorded in the task notes)
- [x] #4 The other Go file validators are checked for the same two patterns (whole-file regex per file, per-match prefix rescans) and fixed where found
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Correctness: Go secretPatterns now mirror SECRET_PATTERNS in validate-secrets.ts shape for shape (quoted value required, same keyword set, one issue per line, same 'potential <name> detected' message). Excludes reach Go: codebaseValidateRequest gained an Exclude field applied to the walk, withGoValidator sends the manifest's string excludes on the request and the validator options flat ({root, ...options}) so Go factories actually see them; withGoValidator also normalises Go's omitempty 'issues' to []. New validate-secrets.test.ts runs both implementations over one fixture (quoted secret, prose, PEM, AWS key, .test. file, excluded dir) and asserts identical findings; on this repo both now report 0 with the manifest excludes (was 84 vs 2). Performance: line-by-line scan gated by a keyword pre-check over one ASCII-lowered copy (bytes.Contains, one allocation per file), line numbers from the loop. Benchmark on this repo, 1964 files, best of 4 warm, both paths in one process: Go 104.5 ms vs TypeScript 126.1 ms (before: 530 ms vs 146 ms). Go micro-bench, 92 KB file with no keyword: 0.24 ms, 1 alloc. AC #4: the grep found one more site, extractJSDocEntries in workspace_validators.go (validate-docs), which re-ran the JSDoc regex over the growing prefix and recounted newlines for every export, quadratic in exports. Rewritten as a single pass with one cursor over the JSDoc matches and an incremental line count; covered by workspace_validators_jsdoc_test.go. No other validator uses either pattern now.
<!-- SECTION:NOTES:END -->
