---
id: TASK-234
title: Replace the @std parsers and @eemeli/yaml with vetted npm packages
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:45'
labels:
  - dependencies
  - std
  - formats
milestone: m-2
dependencies:
  - TASK-231
priority: high
ordinal: 234000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision std-deps, swap @std/toml, @std/jsonc, @std/csv, @std/semver, @std/ulid, @std/tar and the @eemeli/yaml alias for vetted npm packages (for example yaml, smol-toml, jsonc-parser, semver), or for crypto.randomUUID where a ULID is not required. Each dependency gets a vetting note under tooling-standards, and the integration agent lands the lockfile changes.

Decisions this task waits on: decision-4 (Keep the Deno standard library (@std via JSR) through M1, or remove it during the cutover); decision-30 (Replacements for the JSR-hosted runtime dependencies).

Plan key: M2-T3. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No @std/* or @jsr/* runtime dependency remains in any package.json apart from test-kit's @std/assert and @std/testing, which M2-T4 removes
- [x] #2 The formats round-trip tests and other affected tests pass
- [x] #3 Each new dependency has a vetting note in the task
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26. Replacements, per decision-30 and the owner's choices:

- `@eemeli/yaml` (the JSR alias) became the npm package `yaml`, the same library and version: codebase validate-yaml, config file loader and manifest, formats yaml, noskills (hook-decisions, purge and its test, spec/living, state/persistence, purge-history and its test), workflows loader. The noskillsfx Go comments that named the alias now name the package.
- `@std/jsonc` became `jsonc-parser` in codebase validate-json and the config file loader. jsonc-parser recovers from errors instead of throwing, so both callers collect its ParseError list and raise the first error as a SyntaxError ("Cannot parse JSONC: CommaExpected at line 3, column 3"); comments and trailing commas stay allowed and empty content stays an error. New config/file/loader.test.ts covers JSONC, TOML and YAML parsing and the error shapes.
- `@std/toml` became `smol-toml` in codebase validate-toml, the config file loader and formats toml. smol-toml has no key alignment, so the TOML `pretty` option no longer does anything; the formats README tables say so and show its array form `[ 80, 443 ]`.
- `@std/semver` became `semver` (with `@types/semver` as a devDependency) in codebase versions and standards versions and its test. `compareSemanticVersions` takes semver's `SemVer` and `Range` classes; `compareTextVersions` still throws a TypeError for text that is neither.
- `@std/ulid` in laroux-bundler became `crypto.randomUUID()`: the build id is only compared for equality and used as a cache-busting query value, nothing orders by it.
- `@std/csv` became an in-house RFC 4180 codec, formats/formats/csv-codec.ts, written test first (csv-codec.test.ts): fields with the delimiter, a quote, CR or LF are quoted, quotes doubled, rows end with CRLF; the streaming reader takes LF and CRLF, reads quoted fields across lines and chunk boundaries (every split point of a sample is checked), skips blank lines and rejects bare quotes, text after a closing quote and an unterminated field with a CsvParseError. The csv format keeps its field-count check. The header line of `writeStart` is now quoted like any row and ends with CRLF instead of LF.
- `@std/tar` in kit recipes/tar.ts became the Go extractor `kitfx.ExtractTarball` behind a push-fed bridge stream: `kitExtractTarballStream` (open with `{dir, stripComponents, subpath, maxBytes, maxEntries}`, handle prefix `kittar`) and the call `kitExtractTarballStreamPush` (`{handle, chunk (base64), end}`), in pkg/@eserstack/ajan/bridge_kit_tar.go, native only like the other kit names (kitfx links net/http and os/exec, which the wasi profile forbids). The extractor runs in a goroutine; every push waits until it has used up the chunk or finished, so a limit is reported while the download is still open, and close stops an unfinished extraction before it answers. `extractTarball` keeps its options, `TarballLimitError`, `RangeError` validation and stream cancellation. Registered in ffi/bindings.ts (`wasm: "no"`); the native registry has 76 calls and 9 streams (dispatch_test.go). Bridge tests in bridge_kit_tar_test.go.
- Go extractor rules added test first in pkg/ajan/kitfx/tar_test.go: an entry cut off by maxBytes leaves no partial file (it did), a negative stripComponents is an error (it panicked), plus `filepath.IsLocal` on each target path for Windows-only escapes. The other rules (regular files of typeflag 0, NUL and 7 only, escapes dropped, byte and entry limits at their exact boundaries, skipped entries counted, subpath on a segment boundary, root subpaths) already held and now have tests. One difference from @std/tar: Go's reader checks pax records, so a malformed one fails the archive; pax and GNU long-name records count with the entry they describe.
- cmd/eser kit_parity_test.go: the ESER_AJAN=disabled run (ts-engine) skips the whole-repo clone, which extracts a tarball and so needs the native library; the ts-default run still compares the TypeScript engine there, since a whole-repo clone never takes the FFI fast path.
- The three tests that built archives with @std/tar/tar-stream (tar.test.ts, recipe-applier.test.ts, handlers/clone-recipe.test.ts) use a small ustar writer in kit/recipes/testing.ts (`tarArchive`, `gzipStream`, `gzippedTarball`).

Vetting (npm registry, 2026-10-26; the bulk advisory endpoint reports no advisory for any of these versions; none has runtime dependencies, peer dependencies or install scripts, so no allowBuilds entry is needed):

- `yaml` 2.9.1: ISC; maintainer eemeli (Eemeli Aro), published 2026-09-11, first release 2011; about 143 million downloads a week. The library the code already ran as the JSR alias, so behaviour and exit cost are unchanged; dropping the alias removes the JSR registry from every consumer install.
- `jsonc-parser` 3.3.1: MIT; published by Microsoft (vscode-bot, the VS Code team's maintainers); about 47 million downloads a week. The last release is from 2024-06-24, but it is the parser VS Code itself ships and is stable. Used for one parse call in two files, so the exit cost is small. It ships UMD and ESM builds; Node's namespace import of the UMD build exposes the named exports.
- `smol-toml` 1.9.1: BSD-3-Clause; maintainer cyyynthia (Cynthia, squirrelchat), published 2026-10-09 from GitHub Actions with provenance; about 29 million downloads a week. TOML 1.0 compliant, ESM with types, no dependencies. Three call sites.
- `semver` 7.8.5: ISC; the npm CLI team (npm-cli-ops and others), published 2026-06-19 from GitHub Actions with provenance; about 550 million downloads a week. The reference implementation npm itself uses; the 2023 ReDoS advisory was fixed in 7.5.2. It is CommonJS, and Node's namespace import exposes its named exports.
- `@types/semver` 7.8.0 (devDependency of codebase and standards): MIT; DefinitelyTyped, published 2026-08-02; about 22 million downloads a week. Types only.

Verified: every package.json lists `@std/` or `@jsr/` only in test-kit (`@std/assert`, `@std/testing`); the formats round-trip, csv-codec, config loader, standards and codebase versions, kit (266 tests), noskills and ajan parity tests pass; `pnpm ok` printed "All checks passed!".

Left open: the public types of `standards/versions` (`compareSemanticVersions`) name semver's `SemVer` and `Range`, so a consumer that type-checks against the published standards source needs `@types/semver`; decide with the npm library publishing (TASK-236) whether it moves to dependencies. Without the native library (the WASM fallback or a failed load) `extractTarball` now throws instead of extracting in TypeScript, as the owner chose.
<!-- SECTION:NOTES:END -->
