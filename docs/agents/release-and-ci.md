# eser/stack Release Pipeline and Workflows

Facts about the eser/stack release pipeline and workflows that the
release-and-ci skill refers to.

## Versions and Commands

- Every package under `pkg/@eserstack/` (the libraries and tools plus the six
  `ajan-*` and five `noskills-*` platform packages) shares the version in
  `VERSION`. The next release is 5.0.0, the first after the move to Node
  (decision-29).
- The release commands run through the manifest scripts:
  - full gate: `pnpm cli ok`;
  - release preflight: `pnpm cli preflight`;
  - release: `pnpm cli codebase release <patch|minor|major|same>` (also
    `pnpm cli release`);
  - `pnpm cli codebase rerelease`, `pnpm cli codebase unrelease`;
  - bump without releasing: `pnpm cli codebase versions`;
  - changelog: `pnpm cli codebase changelog-gen`.
- The preflight builds the three npm bundles, installs the CLI outside the repo
  from a packed tarball, builds the native and wasm ajan libraries, runs the
  release compile for the host (`eser dev compile --current-only`), stages the
  host's noskills binary into its npm platform package
  (`eser dev npm-binaries`) and installs the packed noskills launcher outside
  the repo (`etc/scripts/preflight-noskills-launcher.ts`), runs
  `eser dev homebrew` and `eser dev nix-hashes` in dry-run mode, and runs the
  old TypeScript updater of a v4.5.2 laroux and noskills under node against a
  local release of the laroux stub and the Go noskills
  (`cmd/legacy-forwarder/legacy_update_test.go`).
- The install dry runs are Go tests in `cmd/noskills/install_dry_run_test.go`.
  `TestInstallShInstallsTheGoNoskills` and `TestInstallShDecidesFromTheRelease`
  run in `go test ./...`: install.sh installs the Go noskills from a local
  release, points to `npm i -g <product>` when the release has no archive of
  eser or noskills, and sends laroux to npm from `LAROUX_NPM_ONLY_VERSION`
  (5.0.0) on. `TestInstallPs1InstallsTheGoNoskills` and
  `TestInstallPs1DecidesFromTheRelease` check the same for install.ps1 and need
  Windows and `ESER_INSTALL_PS1_DRY_RUN=1`; the Homebrew formula test needs brew
  and `ESER_HOMEBREW_DRY_RUN=1` (both change the machine while they run). The
  `windows-smoke` job runs the install.ps1 tests. The flake's `noskills`
  package is checked with `nix build .#noskills`, and the precommit step
  `nix-vendor-hash` keeps its `vendorHash` in step with `go.sum`.
- Tag runs are watched at https://github.com/eser/stack/actions.

## Release Run in build.yml

The `v*.*.*` tag push runs the Integrity Pipeline (`build.yml`):

```
validate
 └─ preflight                  the release preflight above
     └─ release-gate           tag == VERSION, CHANGELOG.md has that section
         ├─ smoke-test         builds and runs the eser, noskills and laroux bundles
         │   └─ npm-consumer-test   installs the eser bundle into a scratch project
         └─ build-ajan-darwin
             └─ compile-binaries    eser dev compile: eser, noskills, laroux stub, noskills-server
                 └─ publish-ajan    ajan-* and noskills-* platform packages on npm
                     └─ publish     eser, noskills and laroux bundles on npm
                         └─ release-notes   changelog section to GitHub Release
                             └─ upload-assets   cosign signatures + SHA256SUMS
                                 ├─ update-homebrew
                                 └─ update-nix-hashes
```

`publish-ajan` and `publish` also wait for `smoke-test` and
`npm-consumer-test`, so nothing reaches npm before both pass. An ordinary push
runs `validate`, `mux-no-js-runtime`, `cross-runtime-test` (Node on Linux and
macOS), `node-ffi-cli` and `windows-smoke`, and `preflight` on `main`. The
Validate job also runs `make vuln` (govulncheck for both Go modules).

## Publishing Targets

- **JSR:** frozen at 4.5.x (decision-5). No job publishes to it, and the JSR
  versions stay available without updates.
- **npm bundles:** `eser` (built by `pnpm cli build` from
  `pkg/@eserstack/cli`), `noskills`
  (`pkg/@eserstack/noskills/scripts/npm-build.ts`) and `laroux`
  (`pkg/@eserstack/laroux-server/scripts/npm-build.ts`). `smoke-test` builds
  them and `publish` runs `pnpm publish --provenance --access public` for each,
  skipping a version npm already has. `noskills` is a launcher for the Go
  binary (`dist/noskills.js`) and carries the TypeScript CLI in `dist/ts/` for
  the commands the binary forwards.
- **Libraries:** the `@eserstack/*` libraries publish to npm from 5.0.0; the
  publish step for them is TASK-236. The laroux packages (`laroux`,
  `laroux-bundler`, `laroux-react`, `laroux-server`) list what they publish in
  the `files` field of their `package.json`.
- **Release binaries:** Go commands built by `eser dev compile`
  (`ReleaseBinaries` in `pkg/ajan/codebasefx`): `eser`, `noskills`,
  `noskills-server` and, under the `laroux` archive name, the
  `cmd/legacy-forwarder` stub that installed v4.5.x laroux binaries update to
  (decision-9). Archive names keep the Rust triples (decision-38).
- **Install scripts:** `etc/scripts/install.sh` and `install.ps1` are served
  from `main` and decide from the release they resolve (decision-11): the
  latest one, or the one `ESER_INSTALL_VERSION` (install.sh) or `-Version`
  (install.ps1) names. A release without the product's archive gets the
  `npm i -g <product>` command and a non-zero exit, and laroux goes to npm from
  5.0.0 on.
- **Nix:** `eser dev nix-hashes` writes `nix/hashes.json` after a release. A
  binary the release has no archives of keeps the entry of the earlier release
  that had them, with that release's version in the entry, and the flake
  fetches each archive at its entry's version.
- **Go modules:** not published. `noskills-server` and the bridge library are
  built from the release tag; the modules get no tags of their own.
- **npm platform packages:** the six `@eserstack/ajan-*` packages carry the
  prebuilt Go library. `make ajan-lib TARGET=<id>` and `make ajan-wasm` build it
  and `make ajan-packages` stages it into each package;
  `publish-ajan` publishes them before the bundles need them. The five
  `@eserstack/noskills-<platform>` packages (`darwin-arm64`, `darwin-x64`,
  `linux-arm64`, `linux-x64`, `win32-x64`) carry the Go `noskills` binary:
  `eser dev compile` builds it, `eser dev npm-binaries` stages it into each
  package, and `publish-ajan` publishes them too. They must be on npm before
  `noskills@<version>`, which pins them. None of the five exists on npm yet, so
  each needs the one-time bootstrap below and a trusted publisher.
- **New npm packages:** published once by hand from the artifacts of
  `publish-ajan.yml` in bootstrap mode, then given a trusted publisher.
- **Exact pins:** `cli` and `ajan` declare the platform packages with
  `workspace:*`; the eser bundle's generated `dist/package.json` resolves them to
  the exact released version (`pkg/@eserstack/codebase/npm-workspace-specifiers.ts`).
  A range would let npm pair the bundle with an older platform package, and the
  bundle then fails on exports that package does not have.

Verify a release with `npm view eser version`, `npm view noskills version`,
`npm view laroux version`, one `@eserstack/ajan-*` package and one
`@eserstack/noskills-*` package.

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
