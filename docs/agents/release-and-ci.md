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
  - changelog: `pnpm cli codebase changelog-gen`.
- The preflight builds the two npm bundles, installs the CLI outside the repo
  from a packed tarball, builds the native and wasm ajan libraries, runs the
  release compile for the host (`eser dev compile --current-only`), stages the
  host's noskills binary into its npm platform package
  (`eser dev npm-binaries`) and installs the packed noskills launcher outside
  the repo (`etc/scripts/preflight-noskills-launcher.ts`), runs
  `eser dev homebrew` and `eser dev nix-hashes` in dry-run mode, and runs the
  old TypeScript updater of a v4.5.2 laroux and noskills under node against a
  local release of the laroux stub and the Go noskills
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
  `etc/scripts/preflight-laroux-app.ts` scaffolds the laroux-app recipe outside
  the repo, removes its config file, installs it with npm from the packed
  `laroux` and libraries (an `overrides` map and the same unreachable scope)
  and runs `laroux dev` with one HMR edit, `laroux build` and `laroux serve`
  through the recipe's scripts; a resolve hook records every module the
  servers load, and react, react-dom and `@eserstack/laroux-server` must each
  load from one directory and the action registry from one file (TASK-237).
  The servers load the native library of `make ajan-lib` through
  `ESER_AJAN_LIB_PATH`, since the packed platform packages carry none. Last,
  `etc/scripts/preflight-plugin-bins.ts` installs the packed posts library and
  laroux package and their `@eserstack` dependencies, with the noskills bundle
  and the host's noskills platform package that its `--save-bundles` step
  packed while the bundle was still in dist/, outside the repo; it runs
  `eser-posts --help` and `TestForwardReachesThePackedCLIs` of `cmd/eser` on
  the installed bins.
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
         ├─ smoke-test         builds and runs the eser and noskills bundles
         │   └─ npm-consumer-test   installs the eser bundle into a scratch project
         └─ build-ajan-darwin
             └─ compile-binaries    eser dev compile: eser, noskills, laroux stub, noskills-server
                 └─ publish-ajan    ajan-* and noskills-* platform packages on npm
                     └─ publish     @eserstack libraries and laroux, then the eser and noskills bundles on npm
                         └─ release-notes   changelog section to GitHub Release
                             └─ upload-assets   cosign signatures + SHA256SUMS
                                 ├─ update-homebrew
                                 └─ update-nix-hashes
```

`publish-ajan` and `publish` also wait for `smoke-test` and
`npm-consumer-test`, so nothing reaches npm before both pass. An ordinary push
runs `validate`, `mux-no-js-runtime`, `cross-runtime-test` (Node on Linux and
macOS), `laroux-smoke` (the reusable `laroux-smoke.yml`: the laroux app check
of the preflight on Linux and macOS), `node-ffi-cli` and `windows-smoke`, and
`preflight` on `main`. The
Validate job also runs `make vuln` (govulncheck for both Go modules).

## Publishing Targets

- **JSR:** frozen at 4.5.x (decision-5). No job publishes to it, and the JSR
  versions stay available without updates.
- **npm bundles:** `eser` (built by `pnpm cli build` from
  `pkg/@eserstack/cli`) and `noskills`
  (`pkg/@eserstack/noskills/scripts/npm-build.ts`). `smoke-test` builds them
  and `publish` runs `pnpm publish --provenance --access public` for each,
  skipping a version npm already has.
- **laroux:** the npm package `laroux` is the workspace package
  `pkg/@eserstack/laroux-bin` (TASK-237, decision-47): its bin `laroux` is its
  emitted `dist/cli.js`, which runs the CLI of `@eserstack/laroux-server`, and
  its one dependency is `@eserstack/laroux-server` at the same version, so the
  commands, react, react-dom, rolldown, sharp, lightningcss and tailwind come
  from the app's node_modules and nothing is inlined. It has no `exports`, so
  it is no library: `pnpm -r build` builds it and `publish` publishes it from
  the workspace right after the libraries, with the same `npm view` check. `noskills` is a launcher for the Go
  binary (`dist/noskills.js`) and carries the TypeScript CLI in `dist/ts/` for
  the commands the binary forwards.
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
  `./client/bootstrap` export stays on the source. The bundles of `cli` and
  `noskills` share that `dist/`: the library build removes
  a bundle there and a bundle build removes the library emit, so whichever a
  later step packs is built last. In the release run the two never meet:
  `smoke-test` builds the bundles and hands them on as artifacts, `publish`
  downloads them into `npm-dist/` outside the workspace and builds the
  libraries in its own checkout. In the preflight the library steps run after
  every step that uses a bundle. `cli` publishes no bin
  (`publishConfig.bin` is empty), so the `eser` command comes from the `eser`
  bundle only. The exports carry `types` and `import` only, so `require()` of a
  library fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`; no consumer needs CommonJS
  yet.
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
- **New npm packages:** a name npm does not have yet is published once by hand
  and then given a trusted publisher; see Bootstrapping New npm Names.
- **Exact pins:** `cli` and `ajan` declare the platform packages with
  `workspace:*`; the eser bundle's generated `dist/package.json` resolves them to
  the exact released version (`pkg/@eserstack/codebase/npm-workspace-specifiers.ts`).
  A range would let npm pair the bundle with an older platform package, and the
  bundle then fails on exports that package does not have.

Verify a release with `npm view eser version`, `npm view noskills version`,
`npm view laroux version`, one `@eserstack/ajan-*` package, one
`@eserstack/noskills-*` package and one library, such as
`npm view @eserstack/standards version`.

## Bootstrapping New npm Names

npm attaches a trusted publisher only to a package that exists, so OIDC cannot
create a name: the first publish of a new name answers 404 on the PUT, and the
`publish` or `publish-ajan` job fails. The owner bootstraps each such name once
before the release that first publishes it. Agents never publish.

These 43 names are not on npm yet (checked on 2026-10-26 with
`npm view <name> version`, which answered E404 for each):

- the 38 libraries: `@eserstack/agents`, `@eserstack/ai`, `@eserstack/ajan`,
  `@eserstack/app-runtime`, `@eserstack/bundler`, `@eserstack/cache`,
  `@eserstack/cli`, `@eserstack/codebase`, `@eserstack/collector`,
  `@eserstack/config`, `@eserstack/crypto`, `@eserstack/cs`, `@eserstack/di`,
  `@eserstack/events`, `@eserstack/formats`, `@eserstack/fp`,
  `@eserstack/functions`, `@eserstack/http`, `@eserstack/httpclient`,
  `@eserstack/kit`, `@eserstack/laroux`, `@eserstack/laroux-bundler`,
  `@eserstack/laroux-react`, `@eserstack/laroux-server`, `@eserstack/logging`,
  `@eserstack/mux`, `@eserstack/noskills`, `@eserstack/noskills-client`,
  `@eserstack/noskills-web`, `@eserstack/parsing`, `@eserstack/posts`,
  `@eserstack/primitives`, `@eserstack/shell`, `@eserstack/standards`,
  `@eserstack/streams`, `@eserstack/testing`, `@eserstack/webtransport`,
  `@eserstack/workflows`;
- the five noskills platform packages: `@eserstack/noskills-darwin-arm64`,
  `@eserstack/noskills-darwin-x64`, `@eserstack/noskills-linux-arm64`,
  `@eserstack/noskills-linux-x64`, `@eserstack/noskills-win32-x64`.

The six `@eserstack/ajan-*` packages and the `eser`, `noskills` and `laroux`
bundles are on npm at 4.5.2. To list the missing names again:

```bash
for f in pkg/@eserstack/*/package.json; do
  name=$(node -p "const m = require('./$f'); m.private ? '' : m.name")
  [ -n "$name" ] && { npm view "$name" version >/dev/null 2>&1 || echo "$name"; }
done
```

The owner's steps, once per name:

1. Publish a placeholder, logged in to npm as an owner of the `eserstack`
   organization, so the name exists without taking a release version. With the
   names above in `names.txt`:

   ```bash
   mkdir -p etc/temp/npm-bootstrap && cd etc/temp/npm-bootstrap
   while read -r name; do
     dir=$(echo "$name" | tr / -)
     mkdir -p "$dir"
     printf '{"name":"%s","version":"0.0.0-bootstrap.0","license":"Apache-2.0","repository":{"type":"git","url":"git+https://github.com/eser/stack.git"}}\n' "$name" > "$dir/package.json"
     (cd "$dir" && npm publish --access public --tag bootstrap)
   done < names.txt
   ```

   The platform packages can instead get their first real version from the
   artifacts of `publish-ajan.yml` in bootstrap mode.

2. On npmjs.com, open each package's Settings, Trusted publishing, and add
   GitHub Actions with repository `eser/stack` and workflow `build.yml`.
3. The next release run publishes the release version of each name over OIDC
   with provenance, and `latest` moves to it. `npm dist-tag rm <name> bootstrap`
   and `npm deprecate <name>@0.0.0-bootstrap.0 "placeholder"` tidy up after.

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
