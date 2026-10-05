# Release Process

Cutting, verifying, recovering and describing releases of a package family that
shares one version, with the `eser codebase` release commands.

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

Rule: Every package of the family shares the version in the root `VERSION` file.
There are no per-package releases. Never edit a `version` field by hand: the
release command bumps `VERSION` and every `package.json` together, and generated
manifests (such as per-package `deno.json`) follow from them.

A Go module in the same repository that nothing outside it imports builds from
the same release tag and gets no tags of its own.

`eser codebase versions <patch|minor|major>` bumps without releasing; the
release command already includes the bump, so it is rarely needed on its own.

| Bump      | When                                                      |
| --------- | --------------------------------------------------------- |
| **patch** | Bug fixes, documentation, dependency updates, refactoring |
| **minor** | New features, non-breaking API additions, new packages    |
| **major** | Breaking changes (see Breaking Changes)                   |

---

## Cutting a Release

Scope: Every release. Only the user starts one: an agent runs these commands
when the user asks for a release, and never suggests or offers one.

Rule: One command does the release; the steps around it make sure the tag it
pushes describes a tree that already passed CI.

1. **Clean state:** `git status` is clean and pushed, and the full gate named in
   this codebase's AGENTS.md passes. The release command aborts on a dirty tree,
   and on unpushed commits unless `--yes`.
2. **Preflight:** run this codebase's release preflight on the commit to tag. It
   runs the release-only steps the precommit gate skips: building the npm
   bundles and installing them outside the repo, `deno publish --dry-run`,
   native builds, and dry runs of the release tooling. CI runs the same
   preflight on every push to `main`, and a release gate requires it to have
   passed on the tagged tree.
3. **Preview:** `eser codebase release <patch|minor|major|same> --dry-run`
   prints the old and new version and whether a changelog section would be
   written. Nothing changes.
4. **Release:** `eser codebase release <patch|minor|major|same>`. In one run it
   bumps `VERSION` and every `package.json`, writes the `CHANGELOG.md` section
   from the commits since the last tag, commits
   `chore(codebase): release v<version>`, pushes to `main`, then creates and
   pushes the annotated tag `v<version>`.
5. **Watch** the tag run in the repository's Actions tab.

`same` re-cuts a release at the current version; see Re-Release, Resume and
Unrelease for when that is still legal.

---

## Release Run

Scope: What the tag push triggers

Rule: The `v*.*.*` tag push, not the release commit, starts the release. The
release workflow orders its jobs so that nothing is published before a gate
passes:

1. Validation, then a **release gate** that checks the tag equals `VERSION` and
   that `CHANGELOG.md` has a section for it. A mismatch fails while every
   registry is still untouched.
2. Smoke tests of the built artifacts.
3. Publishing to the registries.
4. Post-publish stages: GitHub release notes from the changelog section,
   binaries, signatures and checksums, package manager formulas.

An ordinary push runs validation (and the preflight on `main`) and publishes
nothing. The concrete job graph is in the docs linked from this codebase's
AGENTS.md.

**Why the CLI pushes the tag and CI does not:** a tag pushed with the workflow's
`GITHUB_TOKEN` does not dispatch another workflow (GitHub's recursion guard). A
tag created in CI would be a tag nothing reacts to, so the tag is pushed under
the developer's credentials.

---

## Publishing Targets

Scope: Where a release goes

Rule:

- **JSR:** generate the publish manifests, then `deno publish`, which publishes
  every package with a publish config. Authentication is OIDC; there is no JSR
  secret.
- **npm:** each npm package is built in CI and published with
  `pnpm publish --provenance --access public`.
- **npm authentication:** OIDC trusted publishing (`id-token: write`,
  `--provenance`). There is no `NPM_TOKEN` or `NODE_AUTH_TOKEN`, and every npm
  package needs a GitHub Actions trusted publisher configured on npm. npm cannot
  attach one to a package that does not exist yet, so a brand-new package is
  published once by hand, then gets its trusted publisher.
- **Every publish step skips versions already on the registry**, so a stage can
  be re-run safely.
- **Packages built from the same commit are pinned exactly.** When a bundle is
  compiled against the ABI of a native or platform package from the same commit,
  its published manifest depends on that exact version, not a range. A floor
  range lets an older native library load under a newer bundle and fail on
  missing exports.

Which packages go to npm and how each is built differs between codebases; the
docs linked from this codebase's AGENTS.md list them.

---

## Post-Release Verification

Scope: After every release

Rule: Check that every target received the new version:

- JSR: the package pages show it.
- npm: `npm view <package> version` for each npm package, including one platform
  package if there are any.
- GitHub: the release exists, its body matches the CHANGELOG section, and the
  binaries, signatures and checksums are attached.
- Package manager formulas (Homebrew, Nix): their update jobs succeeded.

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
client and server wire protocols, and native library ABIs

Rule: A change that makes an existing consumer change code, flags or files to
upgrade is breaking. For each one:

1. Prefer deprecation first: keep the old name or flag working, mark it with
   `@deprecated` in JSDoc (or a warning on the CLI) naming the replacement, and
   remove it in a later release.
2. Mark the commit breaking with `!` after the type and scope (`feat(pkg)!:`) so
   the release is a major bump. Commit messages have no body, so there is no
   `BREAKING CHANGE:` footer.
3. Add a before/after example under `### Migration` in the `Unreleased` section
   of CHANGELOG.md, and the same example in the affected package README. "See
   CHANGELOG" is not a migration guide.
4. State what happens when the two sides run different versions (an older server
   with a newer client, an older native library under a newer bundle), and make
   the newer side either work or fail with an error that names the version to
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

The changelog generator accepts `!` but does not turn it into a migration note,
so the `### Migration` entry is written by hand.

---

## Changelog Entries

Scope: Commit subjects and CHANGELOG.md

Rule: `eser codebase changelog-gen` builds each release section from the
conventional commits since the last tag. It collapses "take" series ("feat: x
(take II)" with "feat: x"), groups entries by Keep a Changelog section, and
replaces an existing section for the same version, so re-running it is safe.

The commit subject is therefore the changelog entry, and the message is that
line alone, two lines at most, with no body (workflow-practices: Git Commit
Policy). Write it from the user's side: what changed for someone using the
package, CLI or service, not which file moved. Use the type that matches the
effect (`feat`, `fix`, `perf`, `revert`) and a scope naming the package.
Anything a subject line cannot carry (removals, migration steps, behavior notes)
goes by hand into the `Unreleased` section of CHANGELOG.md under `### Removed`
or `### Migration`, in the same change.

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

- **Resume (preferred):** run the release workflow by `workflow_dispatch` with
  the existing tag and a stage input that skips what already succeeded
  (validation, smoke tests and the registry publish), so only the post-publish
  stages run against the tag's tree. Nothing touches git. A full-stage resume
  also re-runs validation and the idempotent publish, for example after
  configuring a missing npm trusted publisher. The workflow name and inputs are
  in the docs linked from this codebase's AGENTS.md.
- **Rerelease:** `eser codebase rerelease` deletes the version tag and recreates
  it at HEAD, re-firing the whole run. Use it only when the fix needed a commit
  that changes nothing already published (tooling, workflows, an unpublished
  package).
- **Unrelease:** `eser codebase unrelease` deletes the tag and the GitHub
  Release; the release commit stays in history. `eser codebase release same`
  then cuts a fresh release at the current version.

| Situation                                                    | Action                                       |
| ------------------------------------------------------------ | -------------------------------------------- |
| A stage after publish failed, no code change needed          | Resume via `workflow_dispatch`, post-publish |
| Infrastructure error (runner, network, rate limit)           | Resume, or re-run the failed jobs            |
| Fix touches only tooling, workflow or an unpublished package | Commit, then `rerelease` at the same version |
| Fix touches a package already on JSR or npm at this version  | Commit, then `release patch`                 |
