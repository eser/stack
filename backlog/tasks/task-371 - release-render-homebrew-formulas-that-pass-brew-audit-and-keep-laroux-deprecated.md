---
id: TASK-371
title: 'release: render Homebrew formulas that pass brew audit and keep laroux deprecated'
status: Done
assignee: []
created_date: '2026-10-27 16:00'
labels:
  - release
  - homebrew
  - bug
dependencies: []
priority: high
ordinal: 374000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-240 while preparing the eser/homebrew-tap patch, which adds a `Formula/laroux.rb` deprecated with `deprecate!` and drops the redundant `version` line of `Formula/eser.rb`. The release's `update-homebrew` step (`eser dev homebrew`, PlanHomebrew in pkg/ajan/codebasefx/release_distribution.go) undoes both on the first release that ships Go archives:

- `ReleaseBinaries` builds the laroux forwarding stub under the `laroux` archive name (decision-9) and `HomebrewFormulas` lists laroux, so `update-homebrew` overwrites `Formula/laroux.rb` with a stub formula that has no `deprecate!`. laroux is an npm package now (`npm install --save-dev laroux`, TASK-237, decision-47).
- RenderHomebrewFormula emits `version "<v>"`, which `brew audit --strict` rejects as redundant with the version scanned from the URL, and two descriptions fail the audit's desc rules: laroux's "laroux.js framework CLI" and noskills-server's, which opens with "noskills-server" and a dash, both start lowercase and with the formula name.

The owner approved fixing both on 2026-10-27.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rendered formulas carry no `version` line; Homebrew reads the version from the release URL
- [x] #2 The rendered laroux formula carries `deprecate! date: "2026-10-27", because: "is now on npm: run `npm install --save-dev laroux` in your app"`, as the audited formula of TASK-240 does
- [x] #3 Every description in `HomebrewFormulas` passes the desc rules of `brew audit`
- [x] #4 A table-driven Go test pins the rendered output and failed before the fix
- [x] #5 The rendered formulas pass `brew audit --strict` in a throwaway local tap
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause, in pkg/ajan/codebasefx/release_distribution.go before the fix: RenderHomebrewFormula wrote `version "<v>"` (line 112) although every URL carries the version, the laroux and noskills-server entries of `HomebrewFormulas` (lines 64 and 68) had descriptions that start lowercase and with the formula name, and `HomebrewFormula` had no way to render `deprecate!`, so the laroux formula a release writes from the stub archives (ReleaseBinaries, release_artifacts.go:60) was never deprecated.

Choice, laroux stays in `HomebrewFormulas`, deprecated: decision-9 ships the laroux stub under the `laroux` archive name in every release, and ADR 0005 drops laroux from `ReleaseBinaries`, the install scripts and the Homebrew tap together, only by an owner decision with its own release and Migration entry. decision-23 deprecates the laroux formula through `deprecate!`. So the tap keeps a laroux formula while the stub ships, and the renderer now writes it deprecated.

What changed:

- `HomebrewFormula` has a `Deprecation *HomebrewDeprecation` (date and reason); when set, RenderHomebrewFormula writes `deprecate! date: ..., because: ...` after `license` and before `on_macos`, the order the audit accepts. laroux sets it to 2026-10-27 with the reason of the audited TASK-240 formula.
- RenderHomebrewFormula writes no `version` line.
- Descriptions: laroux is "Command-line tool for laroux.js apps" (the audited TASK-240 formula), noskills-server is "Persistent Claude Code sessions that survive reboots". eser and noskills already passed.
- Tests in release_artifacts_test.go: `homebrewDescProblems` ports the desc rules of Homebrew's rubocops/shared/desc_helper.rb (capital first letter, no formula name or article at the start, "command-line", no full stop, no symbols, 80 characters) and refuses a quote, backslash or `#{` that would break the Ruby string; `TestHomebrewDescProblems` checks it against good and bad descriptions; `TestRenderedHomebrewFormulasPassTheAudit` renders every formula and checks for each, in a table: no version line, the version in all four URLs, the exact desc, the desc rules, and the laroux `deprecate!` between license and on_macos (none elsewhere). Before the fix it failed for all four formulas (version line), and for laroux and noskills-server on desc and deprecate!.
- docs/agents/release-and-ci.md gains a Homebrew bullet under Publishing Targets.

Verified on macOS arm64 with Homebrew 7.0.10: the four formulas rendered through PlanHomebrew with placeholder hashes for 5.0.0 were copied into a local tap made with `brew tap-new <scratch-user>/<scratch-tap> --no-git`; `brew audit --strict --formula` of eser, noskills, laroux and noskills-server exited 0 with no problems, `brew style` on the four reported no offenses, and `brew info` of laroux prints "Deprecated because it is now on npm: run `npm install --save-dev laroux` in your app! It will be disabled on 2027-10-27." For contrast, laroux and noskills-server edited back to the old shape (version line, old desc, no deprecate!) failed the audit with 6 problems: the redundant version and the two desc problems in each. Then `brew untap`; `brew tap` lists no scratch tap. Nothing was installed or pushed; `--online` and `brew test` were not run.

No CHANGELOG entry: no release has written these formulas yet, and users change nothing.
<!-- SECTION:NOTES:END -->
