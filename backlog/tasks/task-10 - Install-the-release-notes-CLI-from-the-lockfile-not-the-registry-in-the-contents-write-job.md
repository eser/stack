---
id: TASK-10
title: >-
  Install the release-notes CLI from the lockfile, not the registry, in the
  contents-write job
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - ci
dependencies: []
references:
  - .github/workflows/build.yml
  - pkg/@eserstack/cli/scripts/npm-build.ts
  - security-report.md
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: medium (likelihood low, impact high). Fingerprint: build.yml/release-notes/unlocked-npm-install-with-write-token. Full record, bounded reproduction and proposed code are in security-report.md.

On every tag release the `release-notes` job (`permissions: contents: write`, build.yml:856) creates an empty scratch project with a one-line package.json (:883) and runs `npm install --no-audit --no-fund "eser@$VERSION"` (:885) with no lockfile, no overrides and no `--ignore-scripts`. The published `eser` manifest written by npm-build.ts:240-245 declares caret ranges for @tailwindcss/oxide, koffi, lightningcss and tailwindcss, so npm resolves the newest matching version of each and of every transitive package at release time and runs their lifecycle scripts. The job then executes the installed tree twice: `eser version` (:896) and `eser codebase gh release-notes --tag v$VERSION --create-if-missing` with `GH_TOKEN: ${{ github.token }}` (:910-912). A lifecycle script therefore runs on the release runner where the same token is persisted in the checkout's .git/config (actions/checkout@v7 at :861-865 without `persist-credentials: false`) and where it can rewrite node_modules/eser before the GH_TOKEN-bearing step runs it; the runtime path additionally loads the resolved koffi in-process (gh.ts:57 -> release-notes.ts:230,284-307 -> shell.exec -> command.ts:338 -> backend-node.ts:49). A malicious or compromised release of any package inside those ranges, published before the tag run, thus executes with a token that can create and edit releases and upload assets of eser/stack (the authority upload-assets itself uses at :1252/:1266) and push to any unprotected branch; installers, the self-updater, Homebrew and Nix take release assets plus same-release SHA256SUMS.txt as their trust root. Every other job installs with `pnpm install --frozen-lockfile`; the only other lockfile-free consumer, npm-no-deno-test (:458), runs with `contents: read` (:406). A lower-differential variant is `"lock": false` in deno.json letting `jsr:@std/path@^1.1.4` float inside update-nix-hashes. Local sandbox reproduction with a loopback dummy registry showed npm 11.19.0 (Node 26.7.0) in this exact consumer shape resolving a caret transitive dependency to the newest offered version, warning about its install script but running it, the script reading a dummy persisted checkout credential, and the installed bin loading the resolved version.

Root cause: build.yml:883-885 resolves `eser@$VERSION` and its dependency graph from the npm registry into a fresh directory with no package-lock.json and without --ignore-scripts, and npm-build.ts:240-245 publishes the CLI manifest with caret ranges instead of exact, lockfile-derived versions; the job doing this holds `contents: write` (build.yml:856), leaves the token persisted in the checkout (:861-865), and executes the resolved tree with GH_TOKEN (:910-912).

Intended behaviour: The release chain only executes code whose identity was fixed and validated earlier in the same run (the tag tree plus the pnpm lockfile, and the in-run `npm-eser` artifact already smoke-tested by npm-no-deno-test), and a job holding a write token consumes in-run artifacts with install scripts disabled rather than re-resolving mutable registry inputs.

Trace:
1. entrypoint .github/workflows/build.yml:885 (jobs.release-notes.steps[Install the published CLI]): `npm install --no-audit --no-fund "eser@$VERSION"` runs in a scratch project created two lines earlier with a one-line package.json and no lockfile; resolution happens against the live registry at release time, install scripts are enabled (ignore-scripts=false), and the loop retries up to 12 times.
2. propagation pkg/@eserstack/cli/scripts/npm-build.ts:240 (main() -> dist/package.json dependencies): The published manifest declares @tailwindcss/oxide ^4.3.3, koffi ^2.15.0, lightningcss ^1.30.0, tailwindcss ^4.1.8; npm picks the newest version matching each range and every transitive range, so whoever can publish inside those ranges selects what is installed (reproduced locally: fixture-dep ^1.0.0 resolved to the newest offered 1.0.5).
3. propagation .github/workflows/build.yml:861 (jobs.release-notes.steps[Checkout repository]): actions/checkout@v7 with default persist-credentials keeps the job's GITHUB_TOKEN in $GITHUB_WORKSPACE/.git/config, so a dependency lifecycle script running during the install step (which has no env: of its own) can already read the contents: write token; it can also modify node_modules/eser in place for the later step.
4. propagation .github/workflows/build.yml:856 (jobs.release-notes.permissions): The job's GITHUB_TOKEN carries contents: write and is exported as GH_TOKEN to the steps that run the installed code.
5. sink .github/workflows/build.yml:910 (jobs.release-notes.steps[Sync CHANGELOG to GitHub Release]): `$ESER_BIN codebase gh release-notes --tag v$VERSION --create-if-missing` executes the freshly resolved node_modules tree with GH_TOKEN (:912); under Node the gh calls go through shell.exec's FFI client, which imports the resolved koffi in-process (backend-node.ts:49), and any lifecycle script already ran during install on the same runner.

Conditions:
- third_party_dependency: A malicious or compromised version of @tailwindcss/oxide, koffi, lightningcss, tailwindcss, or any transitive dependency that satisfies the published ranges must be the newest matching version on the npm registry at the time of the tag run.
- timing_dependency: The package must be published before the release-notes job resolves; the job runs on every tag push and on post-publish resumes, so the window recurs with every release.
- system_configuration: npm on the runner (actions/setup-node node-version "26", bundled npm) runs dependency lifecycle scripts by default: npm 11.19.0 observed locally reports `ignore-scripts=false`, prints an `install-scripts ... not yet covered by allowScripts` warning and still executes the script. Should a future bundled npm make allowScripts blocking by default, the install-script vector closes but the runtime load of the resolved modules (koffi via the FFI client) remains.

Observed in the audit sandbox: lockfile before install: absent; ignore-scripts config: false; `npm warn install-scripts 1 package has install scripts not yet covered by allowScripts: fixture-dep@1.0.5 (postinstall: node postinstall.js)` then the script executed; lockfile after install: present; resolved fixture-dep: 1.0.5; marker: `postinstall executed for fixture-dep@1.0.5`, `cwd=/scratch/consumer/node_modules/fixture-dep`, `GH_TOKEN in env: no`, `checkout .git/config: [http "https://github.com/"] | extraheader = AUTHORIZATION: basic DUMMY-CREDENTIAL-MARKER-v17`; `./node_modules/.bin/fixture-cli` printed `fixture-cli loaded dep: fixture-dep 1.0.5`; npm 11.19.0, node v26.7.0. Wall time under 120 s, memory 512M, network none. Not exercised: the hosted runner's actual npm version and branch-protection state.

Fix strategy: Stop resolving mutable registry content inside the write-token job. Download the in-run `npm-eser` artifact (already validated by npm-no-deno-test) and install it with `--ignore-scripts` against a committed lockfile for the runner consumer, and set `persist-credentials: false` on the release-notes checkout (only CHANGELOG.md and VERSION are read) so no token exists on disk during the install. Simpler still: run `gh release create/edit` from the workflow with notes extracted by a dependency-free `node --experimental-strip-types` call into the pure parseChangelogText in release-notes.ts, so no npm package is executed at all. Independently, have npm-build.ts emit exact versions taken from pnpm-lock.yaml instead of caret ranges so consumers and CI run the same dependency set. Regression: a workflow lint (actionlint custom rule or a codebase validator) that fails any `run:` in a job with write or id-token permissions containing `npm install`/`npx`/`pnpm add` without a lockfile and `--ignore-scripts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: The release chain only executes code whose identity was fixed and validated earlier in the same run (the tag tree plus the pnpm lockfile, and the in-run `npm-eser` artifact already smoke-tested by npm-no-deno-test), and a job holding a write token consumes in-run artifacts with install scripts disabled rather than re-resolving mutable registry inputs.
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: .github/workflows/build.yml, pkg/@eserstack/cli/scripts/npm-build.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The release-notes job no longer installs anything. The pure CHANGELOG parser (ChangelogEntry, HEADING_PATTERN, normalizeTag, parseChangelogText) moved to pkg/@eserstack/codebase/changelog-text.ts with zero imports; release-notes.ts imports and re-exports it, so its public API is unchanged. New etc/scripts/release-notes-from-changelog.ts (imports only node: built-ins and the parser) writes the tag's section to a file; the job runs it with a bare node from the tag tree and then calls gh release view/edit/create directly with the same create-or-edit and concurrent-create fallback as syncReleaseNotes. The checkout now sets persist-credentials: false, so no token sits in .git/config. The validate step's comment now points at changelog-text.ts as the mirrored parser. Regression: pkg/@eserstack/codebase/changelog-text.test.ts asserts the parser has no imports, the extractor imports only node: and the parser, and the release-notes job has no npm/pnpm/yarn/bun install or npx and sets persist-credentials: false; the job assertion fails on the committed build.yml and passes now. actionlint is clean. The npm-build.ts caret ranges in the published CLI manifest are unchanged; they no longer reach a write-token job.
<!-- SECTION:NOTES:END -->
