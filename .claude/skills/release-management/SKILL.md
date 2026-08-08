---
name: release-management
description: Release checklist, version strategy, and publishing workflow for JSR/npm. Use when bumping versions, creating releases, or managing the release pipeline.
---

# Release Management

Unified release process for 42 synchronized packages.

## Quick Start

1. `deno task cli ok` — verify clean state; tree must be clean and pushed
2. `eser codebase release <patch|minor|major|same> --dry-run` — preview the
   version and changelog it would write
3. `eser codebase release <patch|minor|major|same>` — bumps VERSION and every
   `package.json`, generates the CHANGELOG section, commits
   `chore(codebase): release v<version>`, pushes, then creates and pushes the
   annotated `v<version>` tag
4. Watch the tag run at https://github.com/eser/stack/actions

## Key Principles

- All packages share one version — no independent releases
- JSR primary (OIDC auth), npm secondary (only `@eserstack/cli` as `eser`)
- **patch:** bug fixes, docs, deps. **minor:** new features. **major:** breaking changes
- Always update CHANGELOG before releasing
- Tag format: `vx.y.z` — pushing it triggers the entire release run in
  `build.yml` (release-gate → publish → release-notes and the binary chain), not
  just the release notes
- CI never creates tags: a tag pushed by its `GITHUB_TOKEN` dispatches nothing,
  so the CLI pushes it under the developer's credentials

## Anti-Patterns

**"I'll just edit one package's version"**
No. Use the version-bump script. Manual edits break synchronization.

**"Skip the changelog, it's a small fix"**
No. Every release needs a changelog entry — `release-gate` fails the tag run
when `CHANGELOG.md` has no section for the tagged version.

**"The publish failed, I'll just retag the same version"**
Only while nothing has been published. JSR is immutable (yank only) and npm
answers a republish with 403, so once `publish` or `publish-ajan` has written
anything, re-run the failed jobs (infrastructure error) or cut a new patch
version (code fix).

## References

See [rules.md](references/rules.md) for full release checklist and hotfix process.
