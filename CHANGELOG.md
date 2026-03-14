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

## 4.1.4 - 2026-03-14

### Added

- **codebase:** categorized codebase tools.
- **codebase:** updated validate-commit-msg tool to support multiple and
  asterisk scope.

## 4.1.3 - 2026-03-14

### Fixed

- **codebase:** resolved some security issues

## 4.1.2 - 2026-03-14

### Added

- **standards:** walk and colors features for various runtimes.
- **functions:** context-aware tasks, and adapters.
- **bundler:** add Deno module resolution fallback for npm packages
- **bundler:** add projectRoot configuration for module resolution
- **bundler:** enhance Deno bundler output mapping for entry keys
- **bundler:** enhance server action handling with client stubs and reference
  symbols
- **bundler:** implement server action transformation and manifest generation
- **bundler:** add server externals plugin to bundler configuration
- **bundler:** enhance server and client bundling with externals support
- **bundler:** implement policy for external import specifiers in bundling
  process
- add support for imports, dependencies, and devDependencies in package loader
- **laroux:** laroux packages are introduced.
- **bundler:** introduce new testing framework and enhance CSS processing
  capabilities
- added formatting utilities in @eser/standards for better number, size,
  duration, and percentage representation.
- introduced new utilities in the @eser/standards package, including date and
  time formatting, internationalization, and string interpolation functions.
- **fp:** introduced new utility functions, including chunk, get, groupBy,
  keyBy, and memoize, along with their respective tests and benchmarks.
- added @eser/primitives package to provide utility functions and promises.
- CLI and documentation enhancements
- ***:** add FakeServer and temp directory utilities for testing
- **@eser/cs:** minor changes to ready shipping.
- ***:** bump all versions feature

### Changed

- **laroux:** update project structure and configuration for laroux-app
- **laroux:** enhance regex patterns to prevent ReDoS vulnerabilities
- **laroux:** enhance global type definitions for Laroux runtime
- **laroux:** add return types to various functions for improved type safety
- **bundler:** streamline module and chunk manifest generation
- **standards:** simplify runtime entry points by consolidating to a single
  default path.
- **@eser/cs:** remove builders and config files; update CLI and generate
  functionality
- bumped to deno version 2.x

### Fixed

- **codebase:** resolved some security issues
- **codebase:** check-licenses pwd fix.
- shebang consideration.
- **bundler:** update import map resolver for object property access.
- **bundler:** enhance import map resolver
- **bundler:** prevent import path rewriting for action modules
- **bundler:** include server action files in server bundling process
- **laroux:** mark action-registry as external in the bundler configuration to
  ensure bundled actions share the server's registry.
- **laroux:** update dynamic import paths in middleware and route dispatchers to
  comply with Deno's publishing requirements by using file:// protocol.
- **laroux:** mark action-registry as external in the bundler configuration to
  prevent inlining of a local copy, ensuring shared usage of the server's
  registry.
- **laroux:** ensure dynamic imports of server actions are assigned to a
  variable to comply with Deno's publishing requirements, improving import
  handling.
- **laroux:** improved server action loading logic in main.ts to check for the
  existence of the actions file before attempting to import it, providing better
  error handling.
- excluded templates from deno tooling.
- added .npmrc files to templates.
- **laroux:** npm publishing fix.
- **laroux:** improve handling of undefined values in logging and JSR resolver
  plugin
- **laroux:** improve handling of undefined values in various functions
- **laroux:** improve error handling and path management in various functions
- **bundler:** update main entrypoint handling to support null values and custom
  entry names
- **bundler:** update Tailwind CSS plugin reference in deno.json to use
  tailwind-plugin.ts.
- **bundler:** enhance chunk extraction logic to locate component exports when
  proxy files are absent.
- **bundler:** enhance map decoding logic to handle null values more
  effectively.
- **bundler:** improve buffer decoding to handle null/undefined inputs safely.
- **bundler:** the referenceFile is calculated as a relative path from the CSS
  module's directory.
- **logging:** specify FormatterFn type for default text and ANSI color
  formatters for improved type safety.
- **bundler:** ensure stop method returns a promise for consistent behavior.
- updated validation commands in package.json to use the new validation
  structure for licenses.
- **@eser/cli:** --help identifier fix.
- jsr package name resolution bug.
- ensure output writer lock is released on write failure
- **scripts:** version bump script
- **scripts:** deno.jsonc -> deno.json
