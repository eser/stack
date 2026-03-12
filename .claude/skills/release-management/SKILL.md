---
name: release-management
description: Release checklist, version strategy, and publishing workflow for JSR/npm. Use when bumping versions, creating releases, or managing the release pipeline.
---

# Release Management

Unified release process for 29+ synchronized packages.

## Quick Start

1. `deno task validate` — verify clean state
2. `deno run --allow-all ./pkg/@eser/codebase/versions.ts <patch|minor|major>` — bump all packages
3. Update `CHANGELOG.md` — move Unreleased to new version section
4. PR to main → merge triggers JSR + npm publish

## Key Principles

- All packages share one version — no independent releases
- JSR primary (OIDC auth), npm secondary (only `@eser/cli` as `eser`)
- **patch:** bug fixes, docs, deps. **minor:** new features. **major:** breaking changes
- Always update CHANGELOG before releasing
- Tag format: `vx.y.z` (triggers release-notes-sync workflow)

## Anti-Patterns

**"I'll just edit one package's version"**
No. Use the version-bump script. Manual edits break synchronization.

**"Skip the changelog, it's a small fix"**
No. Every release needs a changelog entry for traceability.

## References

See [rules.md](references/rules.md) for full release checklist and hotfix process.
