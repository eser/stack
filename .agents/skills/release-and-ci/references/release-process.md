# Release Process

Cutting, verifying, recovering and describing releases of the synchronized
eserstack packages.

## Contents

- One Version for Every Package
- Cutting a Release
- Release Run
- Publishing Targets
- Post-Release Verification
- Hotfixes
- Breaking Changes
- Changelog Entries
- Re-Release, Resume and Unrelease

---

## One Version for Every Package

Scope: All package versions

Rule: The 48 packages under `pkg/@eserstack/` (42 libraries and tools plus the
six `ajan-*` platform packages) share the version in `VERSION`. There are no
per-package releases. Never edit a `version` field by hand: the release command
bumps `VERSION` and every `package.json` together, and the per-package
`deno.json` files are generated from them.

`deno task cli codebase versions <patch|minor|major>` bumps without releasing;
the release command already includes the bump, so it is rarely needed on its
own.

| Bump      | When                                                      |
| --------- | --------------------------------------------------------- |
| **patch** | Bug fixes, documentation, dependency updates, refactoring |
| **minor** | New features, non-breaking API additions, new packages    |
| **major** | Breaking changes (see Breaking Changes)                   |

---

## Cutting a Release

Scope: Every release. An agent runs these commands only when the user asks for a
release.

Rule: One command does the release; the steps around it make sure the tag it
pushes describes a tree that already passed CI.

1. **Clean state:** `git status` is clean and pushed, and `deno task cli ok`
   passes. The release command aborts on a dirty tree, and on unpushed commits
   unless `--yes`.
2. **Preflight:** `deno task cli preflight` on the commit to tag. It runs the
   release-only steps precommit skips: the three npm bundles, a packed install
   of the CLI outside the repo, `deno publish --dry-run`, the native and wasm
   ajan builds, the release `deno compile` for the host, and the Homebrew and
   Nix scripts in dry-run mode. CI runs the same workflow on every push to
   `main`, and `release-gate` requires it to have passed on the tagged tree.
3. **Preview:**
   `deno task cli codebase release <patch|minor|major|same> --dry-run` prints
   the old and new version and whether a changelog section would be written.
   Nothing changes.
4. **Release:** `deno task cli codebase release <patch|minor|major|same>`. In
   one run it bumps `VERSION` and every `package.json`, writes the
   `CHANGELOG.md` section from the commits since the last tag, commits
   `chore(codebase): release v<version>`, pushes to `main`, then creates and
   pushes the annotated tag `v<version>`.
5. **Watch** the tag run at https://github.com/eser/stack/actions.

`same` re-cuts a release at the current version; see Re-Release, Resume and
Unrelease for when that is still legal.

---

## Release Run

Scope: What the tag push triggers

Rule: The `v*.*.*` tag push, not the release commit, starts the release.
`build.yml` then runs:

```
validate
 └─ release-gate           tag == VERSION, CHANGELOG.md has that section
     ├─ smoke-test
     │   └─ npm-no-deno-test
     │       └─ publish            JSR + npm bundles
     │           └─ release-notes  changelog section → GitHub Release
     └─ build-ajan-darwin
         └─ compile-binaries
             └─ publish-ajan       ajan-* platform packages on npm
                 └─ upload-assets  cosign signatures + SHA256SUMS
                     ├─ update-homebrew
                     └─ update-nix-hashes
```

`release-gate` runs before anything is published, so a tag that disagrees with
`VERSION`, or a version without a changelog section, fails while every registry
is untouched. An ordinary push runs `validate`, `cross-runtime-test` and
`windows-smoke` (and `preflight` on `main`), and publishes nothing.

**Why the CLI pushes the tag and CI does not:** a tag pushed with the workflow's
`GITHUB_TOKEN` does not dispatch another workflow (GitHub's recursion guard). A
tag created in CI would be a tag nothing reacts to, so the tag is pushed under
the developer's credentials.

---

## Publishing Targets

Scope: Where a release goes

Rule:

- **JSR:** the `publish` job runs `etc/scripts/gen-jsr-manifests.ts` and then
  `deno publish`, which publishes every package whose generated `deno.json` has
  a publish config. Authentication is OIDC; there is no JSR secret.
- **npm bundles:** three packages, `eser` (built by `deno task cli build` from
  `pkg/@eserstack/cli`), `noskills`
  (`pkg/@eserstack/noskills/scripts/npm-build.ts`) and `laroux`
  (`pkg/@eserstack/laroux-server/scripts/npm-build.ts`). The `smoke-test` job
  builds them; `publish` runs `pnpm publish --provenance --access public` for
  each.
- **npm platform packages:** the six `@eserstack/ajan-*` packages carry the
  prebuilt Go library. `pkg/@eserstack/ajan/scripts/build.ts` builds it and
  `pkg/@eserstack/ajan/npm/generate-packages.ts` stages it into each package;
  `publish-ajan` publishes them before the bundles need them.
- **npm authentication:** OIDC trusted publishing (`id-token: write`,
  `--provenance`). There is no `NPM_TOKEN` or `NODE_AUTH_TOKEN`, and every npm
  package needs a GitHub Actions trusted publisher configured on npm. npm cannot
  attach one to a package that does not exist yet, so a brand-new package is
  published once by hand from the artifacts of `publish-ajan.yml` in bootstrap
  mode, then gets its trusted publisher.
- **Every publish step skips versions already on the registry**, so a stage can
  be re-run safely.

**Platform packages are pinned exactly.** `cli` and `ajan` declare the platform
packages with `workspace:*`. The eser bundle is compiled against the ABI of the
library built from the same commit, so its generated `dist/package.json`
resolves those specifiers to the exact released version
(`pkg/@eserstack/codebase/npm-workspace-specifiers.ts`). A floor range once let
`npx eser` load ajan 4.1.57 under eser 4.5.1 and fail on missing exports.

---

## Post-Release Verification

Scope: After every release

Rule: Check that every target received the new version:

- JSR: `jsr.io/@eserstack/<name>` shows it.
- npm: `npm view eser version`, `npm view noskills version`,
  `npm view laroux version` and one `@eserstack/ajan-*` package.
- GitHub: the `release-notes` job created the release and its body matches the
  CHANGELOG section; the binaries, signatures and `SHA256SUMS` are attached.
- Homebrew and Nix: the update jobs succeeded.

---

## Hotfixes

Scope: An urgent fix for a released version

Rule: `main` is the only long-lived branch. Fix on `main` (or on a short branch
merged into it), then release a patch from `main`. There is no dev branch to
merge back into.

---

## Breaking Changes

Scope: Any change to a public interface: package exports and their types, CLI
commands and flags, config keys, environment variables, persisted file formats,
the noskills client and daemon wire protocol, and the eser and ajan library ABI

Rule: A change that makes an existing consumer change code, flags or files to
upgrade is breaking. For each one:

1. Prefer deprecation first: keep the old name or flag working, mark it with
   `@deprecated` in JSDoc (or a warning on the CLI) naming the replacement, and
   remove it in a later release.
2. Mark the commit breaking (`feat(pkg)!:` or a `BREAKING CHANGE:` footer) so
   the release is a major bump.
3. Add a before/after example under `### Migration` in the `Unreleased` section
   of CHANGELOG.md, and the same example in the affected package README. "See
   CHANGELOG" is not a migration guide.
4. State what happens when the two sides run different versions (an older daemon
   with a newer client, an older ajan library under a newer eser), and make the
   newer side either work or fail with an error that names the version to
   install.

Correct:

```markdown
### Migration

- `eser codebase scaffolding gh:owner/repo` is now
  `eser kit clone gh:owner/repo`
- `--skip-post-install` is now `--no-post-install`
```

Incorrect:

```markdown
### Changed

- scaffolding moved to kit
```

`changelog-gen.ts` does not parse `!` or `BREAKING CHANGE` yet, so the
`### Migration` entry is written by hand.

---

## Changelog Entries

Scope: Commit subjects and CHANGELOG.md

Rule: `changelog-gen.ts` builds each release section from the conventional
commits since the last tag. It collapses "take" series ("feat: x (take II)" with
"feat: x"), groups entries by Keep a Changelog section, and replaces an existing
section for the same version, so re-running it is safe.

The commit subject is therefore the changelog entry. Write it from the user's
side: what changed for someone using the package, CLI or daemon, not which file
moved. Use the type that matches the effect (`feat`, `fix`, `perf`, `revert`)
and a scope naming the package. Anything a subject line cannot carry (removals,
migration steps, behavior notes) goes by hand into the `Unreleased` section of
CHANGELOG.md under `### Removed` or `### Migration`, in the same change.

Correct:

```
fix(shell): keep quoted arguments intact when a value contains spaces
```

Incorrect:

```
fix: refactor tokenizer loop
```

---

## Re-Release, Resume and Unrelease

Scope: Recovering a failed release

Rule: A failed release is resumed, not re-tagged. Every publish step is
idempotent (`deno publish` and the npm steps skip versions already published,
release notes edit an existing GitHub Release, asset upload overwrites), so the
chain can run again for the same tag without harm.

**Never retag a version that reached a registry.** JSR is immutable (yank only)
and npm answers a republish with 403. Any package that already published at a
version keeps that tree forever.

- **Resume (preferred):** run the Integrity Pipeline by `workflow_dispatch` with
  `tag` set to the existing tag and `stage` left at `post-publish`. Validation,
  smoke tests and the registry publish are skipped; release notes, binaries,
  assets, ajan platform packages, Homebrew and Nix run against the tag's tree.
  Nothing touches git. `stage: full` also re-runs validation and the idempotent
  publish, for example after configuring a missing npm trusted publisher.

  ```bash
  gh workflow run "Integrity Pipeline" --ref main -f tag=v4.5.1 -f stage=post-publish
  ```

- **Rerelease:** `deno task cli codebase rerelease` deletes the version tag and
  recreates it at HEAD, re-firing the whole run. Use it only when the fix needed
  a commit that changes nothing already published (tooling, workflows, an
  unpublished package).
- **Unrelease:** `deno task cli codebase unrelease` deletes the tag and the
  GitHub Release; the release commit stays in history.
  `deno task cli codebase release same` then cuts a fresh release at the current
  version.

| Situation                                                    | Action                                         |
| ------------------------------------------------------------ | ---------------------------------------------- |
| A stage after publish failed, no code change needed          | Resume via `workflow_dispatch`, `post-publish` |
| Infrastructure error (runner, network, rate limit)           | Resume, or re-run the failed jobs              |
| Fix touches only tooling, workflow or an unpublished package | Commit, then `rerelease` at the same version   |
| Fix touches a package already on JSR or npm at this version  | Commit, then `release patch`                   |
