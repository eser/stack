---
id: TASK-249
title: Move the release commands to Go
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 21:04'
labels:
  - go
  - release
  - codebasefx
milestone: m-3
dependencies:
  - TASK-245
priority: high
ordinal: 249000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement release, rerelease, unrelease, version-bump, versions sync, changelog-gen, release-notes, release-tag and gh contributors as eser codebase subcommands on codebasefx git, versions and changelog. Confirmations use the clifx prompts. The changelog is emitted already formatted. Port the release-contract tests to Go. Switch update-contributors.yml to setup-go. The commands tag and push only when the owner runs them.

Plan key: M3-T8. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A dry run on a temporary repository produces the same VERSION, package.json and CHANGELOG diff as the TS command
- [x] #2 Tests use temporary repositories only; `make ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24/25. Go release commands, codebasefx plus cmd/eser 'eser codebase' (alias cb): release <patch|minor|major|same> [--dry-run] [--yes], rerelease [--dry-run] [--yes], unrelease [--yes], versions [sync|patch|minor|major|<version>] [--dry-run] (alias version-bump; no argument shows the table), changelog-gen [--dry-run], gh release-tag [--dry-run] [--yes], gh release-notes [--repo --tag --create --title], gh contributors [--columns --readme --commit]. Commands that change a remote ask through the clifx prompts (line mode when stdin is not a terminal) unless --yes; a dry run prints each file and the lines it would add and remove. codebasefx: ordered_json.go (key-order-preserving decode and an encoder byte-identical to JSON.stringify(x, null, 2) plus a newline: JS string escaping, JS number formatting such as 1.50 -> 1.5, jsonc comment stripping); release_versions.go (PlanVersions/ApplyEdits: config files in the TS loader's priority deno.json, deno.jsonc, jsr.json, jsr.jsonc, package.json; workspaces from the first file that lists them, so a root deno.json 'workspace' wins over package.json 'workspaces' as in TS; every file holding a different version rewritten; VERSION); changelog_format.go (FormatChangelogSection: the section formatted as deno fmt formats it, greedy wrap at 80 with a 2-space continuation, code spans and links kept whole, *x* to _x_; checked byte for byte against deno fmt in a test), so CHANGELOG.md is emitted already formatted; changelog_text.go (ParseChangelogText, NormalizeTag); release.go (PlanRelease: clean tree, unpushed check unless --yes, versions and the formatted changelog section; ExecuteRelease: writes, stages exactly VERSION, CHANGELOG.md, pkg/*/package.json and package.json, commits 'chore(codebase): release v<version>', pushes the commit, then creates and pushes the annotated tag; PushReleaseTag; Rerelease; Unrelease deletes the GitHub Release before the tag; SyncReleaseNotes); contributors.go (UpdateContributors; reads --paginate output as back-to-back JSON arrays). clifx: flags may now follow positional arguments ('release patch --dry-run'), with '--' ending them (tests added). AC #1: TestPlanVersionsMatchesTypeScript runs the TS versions.ts (patch, minor, sync) and PlanVersions on the same temporary workspace and compares every file (byte-identical, unicode, quotes, nested objects, numbers, a jsonc file); TestReleaseChangelogMatchesTypeScript compares the planned CHANGELOG.md with TS changelog-gen followed by deno fmt CHANGELOG.md (what the TS release does) on a temporary repository with tagged history: identical. AC #2: every test uses temporary repositories (a bare origin whose reference-transaction hook logs ref order): TestReleaseContract (the ported release-contract.test.ts as a real run: staged paths, no generated deno.json, the commit message, the commit before the tag, the tag at the release commit), refusal on a dirty tree and on unpushed commits, rerelease moving the tag to HEAD, unrelease order (gh release delete while the tag still exists) and its confirmation, release notes skipped/created/updated with a fake gh, contributors across two pages with bots dropped; cmd/eser TestCodebaseReleaseDryRunAndVersions. make ok and deno task cli ok passed. Waiting on the owner: switching update-contributors.yml to setup-go and 'go run ./cmd/eser codebase gh contributors --commit' is the patch etc/temp/ci/task-249-ci.patch (gitignored, not applied). Findings: (1) the TS changelog functions generateChangelogSection, insertIntoChangelog and groupBySection (and their tests) are dead code: generateChangelog calls the Go generator through the bridge, whose format (commit hashes, '**scope**:', chore entries under Changed) is what CHANGELOG.md holds; (2) both generators insert a new version above the first '## ' heading, which is '## Unreleased' here (the TS [Unreleased] match needs brackets), so the next release's section lands above the Unreleased migration notes; (3) the TS fetchContributors JSON.parses 'gh api --paginate' output, which fails once there are more than 30 contributors (one array per page).
<!-- SECTION:NOTES:END -->
