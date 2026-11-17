# eser/stack Release Pipeline and Workflows

Facts about the eser/stack release pipeline and workflows that the
release-and-ci skill refers to.

## Versions and Commands

- Every package under `pkg/@eserstack/` (the libraries and tools plus the six
  `ajan-*` and five `noskills-*` platform packages) shares the version in
  `VERSION`. The next release is 5.0.0, the first after the move to Node
  (decision-29).
- The release commands run through the manifest scripts:
  - full gate: `pnpm ok` (`eser ok`, on the Go eser);
  - release preflight: `pnpm preflight` (`eser preflight`);
  - release: `pnpm cli codebase release <patch|minor|major|same>` (also
    `pnpm cli release`);
  - `pnpm cli codebase rerelease`, `pnpm cli codebase unrelease`;
  - bump without releasing: `pnpm cli codebase versions`;
  - changelog: `pnpm cli codebase changelog-gen`, which moves the `Unreleased`
    notes into the section it writes (`InsertIntoChangelog` in
    `pkg/ajan/codebasefx`).
- The preflight installs the packed `@eserstack/ajan` outside the repo and
  loads the Go bridge from it (`etc/scripts/preflight-npm-consumer.ts`),
  builds the native and wasm ajan libraries, runs the release compile for the
  host (`eser codebase dist compile --current-only`), stages the host's eser
  and noskills binaries into their npm platform packages
  (`eser codebase dist npm-binaries`), runs `eser codebase dist homebrew` and
  `eser codebase dist nix-hashes` in dry-run mode, and runs the old
  TypeScript updater of a v4.5.2 laroux, noskills and eser under node against
  a local release of the laroux stub, the Go noskills and the Go eser
  (`cmd/legacy-forwarder/legacy_update_test.go`). Then it builds the libraries
  (`pnpm -r build`), runs the publish job's library step in dry-run mode
  (`etc/scripts/publish-libraries.ts --dry-run`), packs every workspace package
  into `etc/temp/npm-packs`, and installs every packed library together into a
  scratch consumer (`etc/scripts/preflight-library-consumer.ts`). The consumer
  maps each `@eserstack/*` name to its tarball with `overrides`, imports every
  export with `node --no-strip-types` and type-checks the declarations. Both
  library checks point the `@eserstack` scope at an unreachable registry, so
  neither asks npm for an `@eserstack` name; the consumer also checks that its
  lockfile resolves every one of them from a tarball. Then
  `etc/scripts/preflight-npm-launchers.ts` installs the packed `eser` and
  `noskills` and their workspace dependencies outside the repo, with the
  host's platform packages packed with pnpm as the publish job packs them; it
  checks that each tarball holds the binary with its execute bits, that
  `npx eser --help` and `npx noskills --help` run them without EACCES, that an
  unknown noskills command reaches the TypeScript CLI of `@eserstack/noskills`,
  and that `eser noskills --version` and `eser noskills invoke-hook stop` find
  the noskills eser depends on with only node on PATH. Then
  `etc/scripts/preflight-laroux-app.ts` scaffolds the laroux-app recipe outside
  the repo, removes its config file, installs it with npm from the packed
  `laroux` and libraries (an `overrides` map and the same unreachable scope)
  and runs `laroux dev` with one HMR edit, `laroux build` and `laroux serve`
  through the recipe's scripts; a resolve hook records every module the
  servers load, and react, react-dom and `@eserstack/laroux-server` must each
  load from one directory and the action registry from one file (TASK-237).
  The servers load the native library of `make ajan-lib` through
  `ESER_AJAN_LIB_PATH`, since the packed platform packages carry none. Last,
  `etc/scripts/preflight-plugin-bins.ts` installs the packed posts library,
  laroux and noskills packages and their `@eserstack` dependencies, with the
  host's noskills platform package that its `--save-bundles` step packed with
  npm, outside the repo; it runs
  `eser-posts --help` and `TestForwardReachesThePackedCLIs` of `cmd/eser` on
  the installed bins.
- The install dry runs are Go tests in `cmd/noskills/install_dry_run_test.go`.
  `TestInstallShInstallsTheGoBinaries` and `TestInstallShDecidesFromTheRelease`
  run in `go test ./...`: install.sh installs the Go eser and noskills from a
  local release, points to `npm i -g <product>` when the release has no archive
  of eser or noskills, and sends laroux to npm from `LAROUX_NPM_ONLY_VERSION`
  (5.0.0) on. `TestInstallPs1InstallsTheGoBinaries` and
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
         └─ build-ajan-darwin
             └─ compile-binaries    eser codebase dist compile: eser, noskills, laroux stub, noskills-server
                 └─ publish-ajan    ajan-*, eser-* and noskills-* platform packages on npm
                     └─ publish     @eserstack libraries, then laroux, noskills and eser on npm
                         └─ release-notes   changelog section to a draft GitHub Release
                             └─ upload-assets   cosign signatures + SHA256SUMS, then publishes the release
                                 ├─ update-homebrew
                                 └─ update-nix-hashes
```

Nothing reaches npm before the preflight, which `release-gate` needs, has
installed every npm package from its tarball outside the repo: the libraries,
laroux, and the eser and noskills launchers with the host's platform packages.

`release-notes` creates the GitHub Release as a draft, and the last step of
`upload-assets` publishes it as latest once every archive, signature and
`SHA256SUMS.txt` is attached (TASK-376). Until then `releases/latest` and the
tag's download URLs serve the previous release, so install.sh, install.ps1,
`eser update`, the CLI version check and the noskills-server update check never
see a release without archives; a failed upload leaves the draft for a resume.
gh finds a draft by its tag, so `gh release view`, `edit` and `upload` reach it
on the first run and on a resume. The publish step publishes only a draft and
leaves a release that is already published as it is. `update-homebrew` and
`update-nix-hashes` run after it, since they read `SHA256SUMS.txt` from the
public download URL, which serves nothing for a draft. An ordinary push
runs `validate`, `mux-no-js-runtime`, `cross-runtime-test` (Node on Linux and
macOS), `laroux-smoke` (the reusable `laroux-smoke.yml`: the laroux app check
of the preflight on Linux and macOS) and `windows-smoke`, and `preflight` on
`main`. The
Validate job also runs `make vuln` (govulncheck for both Go modules).

## Publishing Targets

- **JSR:** frozen at 4.5.x (decision-5). No job publishes to it, and the JSR
  versions stay available without updates.
- **eser:** the npm package `eser` is the workspace package
  `pkg/@eserstack/eser-bin` (TASK-254), built and published the way laroux is,
  after noskills. Its bin `eser` (`dist/eser.js`) launches the Go binary of
  the `@eserstack/eser-<platform>` optional dependency for the host. It
  depends on `noskills` at the same version and adds every `node_modules/.bin`
  above itself to `ESER_PLUGIN_PATH`, so `npx eser@latest noskills`, which
  eser 4.5 wrote into hooks, runs noskills with no other install
  (decision-10). The Go eser refuses `eser update` under `node_modules` and
  prints the npm command instead.
- **laroux:** the npm package `laroux` is the workspace package
  `pkg/@eserstack/laroux-bin` (TASK-237, decision-47): its bin `laroux` is its
  emitted `dist/cli.js`, which runs the CLI of `@eserstack/laroux-server`, and
  its one dependency is `@eserstack/laroux-server` at the same version, so the
  commands, react, react-dom, rolldown, sharp, lightningcss and tailwind come
  from the app's node_modules and nothing is inlined. It has no `exports`, so
  it is no library: `pnpm -r build` builds it and `publish` publishes it from
  the workspace right after the libraries, with the same `npm view` check.
- **noskills:** the npm package `noskills` is the workspace package
  `pkg/@eserstack/noskills-bin` (TASK-262), built and published the way
  laroux is. Its bin `noskills` (`dist/noskills.js`) launches the Go binary
  of the `@eserstack/noskills-<platform>` optional dependency for the host,
  and names the TypeScript CLI of `@eserstack/noskills`, its one dependency at
  the same version, in `NOSKILLS_TS_BUNDLE` for the commands the binary
  forwards (`watch`, `manager`, `web`).
- **Libraries:** the `@eserstack/*` libraries publish to npm from 5.0.0. Every
  non-private package with `exports` is a library (38 of them). The `publish`
  job runs `pnpm -r build` and then `etc/scripts/publish-libraries.ts`, which
  skips each library whose version npm already has (the `npm view` check of
  `publish-ajan`) and publishes the rest with one
  `pnpm -r publish --provenance --access public --no-git-checks`, so a re-run
  of a version publishes nothing twice. The private test-kit and the platform
  packages are no libraries and are left out. Its `build` script runs `etc/scripts/build-library.ts`, which
  emits JavaScript and declarations into its `dist/` with tsc 7 and
  `tsconfig.build.json`, and fails on an emitted import of a `.ts` file. Its
  `exports` stay on the sources, which the workspace runs, and
  `publishConfig.exports` points at `dist/` with `types` and `import`
  conditions; pnpm swaps it in when it packs. `files` lists the emitted files,
  plus the bootstrap sources laroux-bundler copies from `laroux-react`, whose
  `./client/bootstrap` export stays on the source. `cli` publishes no bin
  (`publishConfig.bin` is empty), so the `eser` command comes from the `eser`
  launcher only. The exports carry `types` and `import` only, so `require()` of a
  library fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`; no consumer needs CommonJS
  yet.
- **Release binaries:** Go commands built by `eser codebase dist compile`
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
- **Homebrew:** `eser codebase dist homebrew` renders `Formula/<binary>.rb` of
  eser/homebrew-tap for each of `HomebrewFormulas` in
  `pkg/ajan/codebasefx/release_distribution.go` that the release has archives
  of, and leaves the others as they are. The formulas pass
  `brew audit --strict`: no `version` line, since Homebrew reads it from the
  archive URL, and descriptions that follow the audit's desc rules, which
  `TestRenderedHomebrewFormulasPassTheAudit` checks. The laroux formula
  installs the laroux stub and carries a `deprecate!` that points to
  `npm install --save-dev laroux` (decision-23, TASK-371); it leaves the tap
  with the stub (ADR 0005). `brew audit` takes formula names only, so check a
  rendered formula in a local tap made with
  `brew tap-new your_user/your_tap --no-git` and removed with `brew untap`.
- **Nix:** `eser codebase dist nix-hashes` writes `nix/hashes.json` after a
  release. A binary the release has no archives of keeps the entry of the
  earlier release that had them, with that release's version in the entry, and
  the flake fetches each archive at its entry's version.
- **Go modules:** not published. `noskills-server` and the bridge library are
  built from the release tag; the modules get no tags of their own.
- **npm platform packages:** the six `@eserstack/ajan-*` packages carry the
  prebuilt Go library. `make ajan-lib TARGET=<id>` and `make ajan-wasm` build it
  and `make ajan-packages` stages it into each package;
  `publish-ajan` publishes them before the libraries need them. The five
  `@eserstack/eser-<platform>` and five `@eserstack/noskills-<platform>`
  packages (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`,
  `win32-x64`) carry the Go `eser` and `noskills` binaries:
  `eser codebase dist compile` builds them, `eser codebase dist npm-binaries`
  stages them into each package, and `publish-ajan` publishes them too.
  `pnpm publish` writes a file at mode 0644 unless the package lists it in
  `publishConfig.executableFiles`, so each platform package lists its binary
  there, and the launcher adds the execute bits before it runs a binary that
  lost them (TASK-368). They must be on npm before `eser@<version>` and
  `noskills@<version>`, which pin them. The five eser ones are not on npm yet,
  so each needs the one-time bootstrap below and a trusted publisher.
- **New npm packages:** a name npm does not have yet is published once by hand
  and then given a trusted publisher; see Bootstrapping New npm Names.
- **Exact pins:** `ajan` and the `eser` and `noskills` launchers declare their
  platform packages, and the launchers their workspace dependencies, with
  `workspace:*`, which `pnpm publish` rewrites to the exact released version. A
  range would let npm pair a package with an older platform package, which
  then lacks the exports or the commands the package expects.

Verify a release with `npm view eser version`, `npm view noskills version`,
`npm view laroux version`, one `@eserstack/ajan-*` package, one
`@eserstack/eser-*` package, one `@eserstack/noskills-*` package and one
library, such as
`npm view @eserstack/standards version`.

## Bootstrapping New npm Names

npm attaches a trusted publisher only to a package that exists, so OIDC cannot
create a name: the first publish of a new name answers 404 on the PUT, and the
`publish` or `publish-ajan` job fails. The owner bootstraps each such name once
before the release that first publishes it. Agents never publish.

These five names are not on npm yet (checked on 2026-11-17 with
`npm view <name> version`, which answered E404): the eser platform packages
of TASK-254, `@eserstack/eser-darwin-arm64`, `@eserstack/eser-darwin-x64`,
`@eserstack/eser-linux-arm64`, `@eserstack/eser-linux-x64` and
`@eserstack/eser-win32-x64`. Every other package, the libraries and the `ajan`
and `noskills` platform packages included, is on npm from 5.0.0.

`etc/scripts/npm-bootstrap.ts` does the npm side. Without `--publish` it only
reads the registry and lists every publishable workspace package npm answers
E404 for; any other `npm view` failure stops it, so a network error never
reads as a free name.

The owner's steps, once per name:

1. Publish a placeholder, logged in to npm as an owner of the `eserstack`
   organization. The script checks `npm whoami`, writes each placeholder
   (`0.0.0-bootstrap.0`, which takes no release version) under
   `etc/temp/npm-bootstrap`, and publishes it with
   `npm publish --access public --tag bootstrap`, one at a time and attached to
   the terminal, so npm can ask for a one-time password or a browser login:

   ```bash
   node ./etc/scripts/npm-bootstrap.ts            # list the missing names
   node ./etc/scripts/npm-bootstrap.ts --publish  # publish their placeholders
   node ./etc/scripts/npm-bootstrap.ts --publish --otp 123456 @eserstack/eser-linux-x64
   ```

   The platform packages can instead get their first real version from the
   artifacts of `publish-ajan.yml` in bootstrap mode.

2. On npmjs.com, open each package's Settings, Trusted publishing, and add
   GitHub Actions with repository `eser/stack` and workflow `build.yml`. The
   script prints the page of each name.
3. The next release run publishes the release version of each name over OIDC
   with provenance, and `latest` moves to it. `npm dist-tag rm <name> bootstrap`
   and `npm deprecate <name>@0.0.0-bootstrap.0 "placeholder"` tidy up after;
   the script prints both for each name.

## Resuming a Release

Run the Integrity Pipeline by `workflow_dispatch` with `tag` set to the
existing tag and `stage` set to `post-publish` (the default) or `full`. Replace
`your_release_tag` with that tag, such as `v4.5.2`:

```bash
gh workflow run "Integrity Pipeline" --ref main -f tag=your_release_tag -f stage=post-publish
```

## Workflows

| Workflow                  | Trigger                                                                                          | Purpose                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `build.yml`               | push, pull_request, `v*` tags, manual                                                            | The Integrity Pipeline: validation, preflight on `main`, the full release on a tag                            |
| `publish-ajan.yml`        | manual                                                                                           | Builds, or bootstraps, the `@eserstack/ajan-*` npm packages outside the pipeline                              |
| `codeql.yml`              | push and pull_request to `main`, weekly                                                          | CodeQL analysis                                                                                               |
| `ffi-workers.yml`         | push and pull_request changing `.node-version`, a `package.json`, `pkg/` or the Go build, manual | The `*.ffi.test.ts` suites and the bridge's worker-thread tests on Linux and macOS (decision-14, decision-37) |
| `laroux-smoke.yml`        | called by `build.yml` on push and pull_request, manual                                           | The packed `laroux` in a new laroux-app: dev, build and serve on Linux and macOS (TASK-237)                   |
| `pr-labeler.yml`          | pull_request                                                                                     | Labels pull requests from `.github/pr-labeler.yml`                                                            |
| `sync-issue-labels.yml`   | push to `main` changing `.github/issue-labels.yml`, manual                                       | Syncs the issue label set                                                                                     |
| `update-contributors.yml` | weekly, manual                                                                                   | Refreshes the contributors list                                                                               |

## Runners and Permissions

- Linux jobs run on `ubicloud-standard-*-arm` or `ubuntu-24.04-arm`;
  `macos-latest` and `windows-latest` only for jobs that need that platform.
- `codeql.yml` runs on `ubuntu-latest` (x64) on purpose, with the reason in a
  comment: it is CodeQL's primary supported platform.
- `build.yml` grants `contents: write` and `id-token: write` at the workflow
  level; read-only jobs declare `contents: read`.
- The Codecov upload in `validate` is non-failing when its secret is empty, so
  fork pull requests pass.
