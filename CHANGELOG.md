# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `CLAUDE.md` and `AGENTS.md` for AI-assisted development guidelines
- `Makefile` with unified command interface
- GitHub Actions workflows: integrity, pr-labeler, sync-issue-labels,
  release-notes-sync, update-contributors
- Version bump automation script (`etc/scripts/version-bump.ts`)
- `CHANGELOG.md` (this file)
- Claude Code PostToolUse hook for decision nudging

### Changed

- Updated `build.yml` with timeout-minutes, workflow_dispatch, and latest Deno
  version
- Expanded Claude Code settings with additional permissions, plugins, and hooks
- Updated pre-commit hooks: conventional-pre-commit v4.3.0, typos v1.40.0, added
  no-commit-to-branch
