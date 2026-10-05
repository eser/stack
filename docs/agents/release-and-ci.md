# eser/stack Release Pipeline and Workflows

Facts about the eser/stack release pipeline and workflows that the
release-and-ci skill refers to.

## Versions and Commands

- Every package under `pkg/@eserstack/` (the libraries and tools plus the six
  `ajan-*` platform packages) shares the version in `VERSION`.
- The release commands run through the manifest scripts:
  - full gate: `deno task cli ok`;
  - release preflight: `deno task cli preflight`;
  - release: `deno task cli codebase release <patch|minor|major|same>` (also
    `deno task cli release`);
  - `deno task cli codebase rerelease`, `deno task cli codebase unrelease`;
  - bump without releasing: `deno task cli codebase versions`;
  - changelog: `deno task cli codebase changelog-gen`.
- The preflight builds the three npm bundles, installs the CLI outside the repo
  from a packed tarball, runs `deno publish --dry-run`, builds the native and
  wasm ajan libraries, runs the release `deno compile` for the host, and runs
  the Homebrew and Nix scripts in dry-run mode.
- Tag runs are watched at https://github.com/eser/stack/actions.

## Release Run in build.yml

The `v*.*.*` tag push runs the Integrity Pipeline (`build.yml`):

```
validate
 └─ release-gate           tag == VERSION, CHANGELOG.md has that section
     ├─ smoke-test
     │   └─ npm-no-deno-test
     │       └─ publish            JSR + npm bundles
     │           └─ release-notes  changelog section to GitHub Release
     └─ build-ajan-darwin
         └─ compile-binaries
             └─ publish-ajan       ajan-* platform packages on npm
                 └─ upload-assets  cosign signatures + SHA256SUMS
                     ├─ update-homebrew
                     └─ update-nix-hashes
```

An ordinary push runs `validate`, `cross-runtime-test` and `windows-smoke`, and
`preflight` on `main`. The Validate job also runs `make vuln` (govulncheck for
both Go modules).

## Publishing Targets

- **JSR:** the `publish` job runs `etc/scripts/gen-jsr-manifests.ts` and then
  `deno publish`.
- **npm bundles:** `eser` (built by `deno task cli build` from
  `pkg/@eserstack/cli`), `noskills`
  (`pkg/@eserstack/noskills/scripts/npm-build.ts`) and `laroux`
  (`pkg/@eserstack/laroux-server/scripts/npm-build.ts`). `smoke-test` builds
  them and `publish` runs `pnpm publish --provenance --access public` for each.
- **Go modules:** not published. `noskills-server` and the bridge library are
  built from the release tag; the modules get no tags of their own.
- **npm platform packages:** the six `@eserstack/ajan-*` packages carry the
  prebuilt Go library. `pkg/@eserstack/ajan/scripts/build.ts` builds it and
  `pkg/@eserstack/ajan/npm/generate-packages.ts` stages it into each package;
  `publish-ajan` publishes them before the bundles need them.
- **New npm packages:** published once by hand from the artifacts of
  `publish-ajan.yml` in bootstrap mode, then given a trusted publisher.
- **Exact pins:** `cli` and `ajan` declare the platform packages with
  `workspace:*`; the eser bundle's generated `dist/package.json` resolves them to
  the exact released version (`pkg/@eserstack/codebase/npm-workspace-specifiers.ts`).
  A range would let npm pair the bundle with an older platform package, and the
  bundle then fails on exports that package does not have.

Verify a release with `npm view eser version`, `npm view noskills version`,
`npm view laroux version`, one `@eserstack/ajan-*` package, and
`jsr.io/@eserstack/<name>`.

## Resuming a Release

Run the Integrity Pipeline by `workflow_dispatch` with `tag` set to the
existing tag and `stage` set to `post-publish` (the default) or `full`. Replace
`your_release_tag` with that tag, such as `v4.5.2`:

```bash
gh workflow run "Integrity Pipeline" --ref main -f tag=your_release_tag -f stage=post-publish
```

## Workflows

| Workflow                  | Trigger                                                    | Purpose                                                                            |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `build.yml`               | push, pull_request, `v*` tags, manual                      | The Integrity Pipeline: validation, preflight on `main`, the full release on a tag |
| `publish-ajan.yml`        | manual                                                     | Builds, or bootstraps, the `@eserstack/ajan-*` npm packages outside the pipeline   |
| `codeql.yml`              | push and pull_request to `main`, weekly                    | CodeQL analysis                                                                    |
| `pr-labeler.yml`          | pull_request                                               | Labels pull requests from `.github/pr-labeler.yml`                                 |
| `sync-issue-labels.yml`   | push to `main` changing `.github/issue-labels.yml`, manual | Syncs the issue label set                                                          |
| `update-contributors.yml` | weekly, manual                                             | Refreshes the contributors list                                                    |

## Runners and Permissions

- Linux jobs run on `ubicloud-standard-*-arm` or `ubuntu-24.04-arm`;
  `macos-latest` and `windows-latest` only for jobs that need that platform.
- `codeql.yml` runs on `ubuntu-latest` (x64) on purpose, with the reason in a
  comment: it is CodeQL's primary supported platform.
- `build.yml` grants `contents: write` and `id-token: write` at the workflow
  level; read-only jobs declare `contents: read`.
- The Codecov upload in `validate` is non-failing when its secret is empty, so
  fork pull requests pass.
