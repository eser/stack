# Release Management - Detailed Rules

## Pre-Release Checklist

**Run `deno task cli preflight` on the commit you are about to tag.** It runs
every release-only step precommit does not: the three npm bundles, a packed
install of the CLI outside the repo, `deno publish --dry-run`, the native and
wasm ajan builds, and the Homebrew and Nix scripts in dry-run mode. CI runs the
same workflow on every push to main and the Release Gate requires it to have
passed on the tagged tree.

Scope: Every release

Rule: Complete all steps in order. One command does the release; the steps around
it exist so the tag it pushes describes a state that already passed CI.

1. **Verify clean state:**
   ```bash
   git status                  # Must be clean, and pushed
   deno task cli ok            # Must pass
   ```
   `release` aborts on a dirty tree, and on unpushed commits unless `--yes`.

2. **Preview:**
   ```bash
   eser codebase release <patch|minor|major|same> --dry-run
   ```
   Prints the old → new version and whether a changelog entry would be written.
   Nothing is touched.

3. **Release:**
   ```bash
   eser codebase release <patch|minor|major|same>
   ```
   In one run it bumps `VERSION` and every `package.json`, generates the
   `CHANGELOG.md` section from the commits since the last tag, commits
   `chore(codebase): release v<version>`, pushes, then creates and pushes the
   annotated tag `v<version>`.

Use `same` to re-cut a release at the current version — see Re-Release below for
when that is still legal.

---

## Release Run

Scope: What the tag push triggers

Rule: The tag push — not the commit — starts the release. `build.yml` runs on a
`v*.*.*` tag as:

```
validate
 └─ release-gate           tag == VERSION, CHANGELOG.md has that section
     ├─ smoke-test
     │   └─ npm-no-deno-test
     │       └─ publish            JSR + npm
     │           └─ release-notes  changelog section → GitHub Release
     └─ build-ajan-darwin
         └─ compile-binaries
             └─ publish-ajan
                 └─ upload-assets  cosign signatures + SHA256SUMS
                     ├─ update-homebrew
                     └─ update-nix-hashes
```

`release-gate` runs before anything is published, so a tag that disagrees with
`VERSION`, or a version with no changelog section, fails the run while every
registry is still untouched.

**Why the CLI pushes the tag and CI does not:** a tag pushed with the workflow's
`GITHUB_TOKEN` does not dispatch another workflow (GitHub's recursion guard). A
tag created in CI would be a tag nothing reacts to.

An ordinary push runs only the Integrity Pipeline — `validate`,
`cross-runtime-test`, `windows-smoke` — and publishes nothing.

---

## Post-Release Verification

Scope: After every release

Rule: Verify all publish targets received the new version.

- Check JSR: packages appear at `jsr.io/@eserstack/<name>` with correct version
- Check npm: `npm info eser` shows new version
- Check GitHub: the `release-notes` job created the release and its body matches
  the CHANGELOG section
- Add `## [Unreleased]` section to CHANGELOG.md for next cycle

---

## Hotfix Process

Scope: Urgent fixes on production

Rule: Hotfixes branch from main, not dev.

1. Branch from main: `git checkout -b hotfix/<description> main`
2. Fix the issue
3. PR directly to main
4. After merge, run `eser codebase release patch` on main — the tag it pushes
   ships the hotfix
5. Cherry-pick or merge back to dev

---

## Version Strategy

Scope: Choosing bump type

Rule: Match the bump type to the nature of changes.

| Bump | When |
|------|------|
| **patch** | Bug fixes, documentation, dependency updates, refactoring |
| **minor** | New features, non-breaking API additions, new packages |
| **major** | Breaking API changes, significant architectural shifts |

All 29+ packages are versioned together — there are no independent package versions.

---

## Publishing Architecture

### JSR (Primary Registry)

- Runs in the `publish` job of a `v*.*.*` tag run, after `release-gate`
- Uses OIDC token authentication (no secrets needed)
- All packages with `publish` config in `deno.json` are published
- Command: `deno publish`

### npm (Secondary Registry)

- Only `@eserstack/cli` is published to npm as the `eser` package
- Built via esbuild bundling: `deno task npm-build`
- Published with provenance: `npm publish --provenance --access public`
- Working directory: `pkg/@eserstack/cli/dist`
- OIDC trusted publishing — no `NODE_AUTH_TOKEN`, no npm secret in CI. Each
  package must have a GitHub-Actions trusted publisher configured on npm

---

**Platform packages are pinned exactly and published first.** The eser bundle
is compiled against the ABI of the `@eserstack/ajan-*` library built from the
same commit, so its generated `dist/package.json` pins every platform package to
the exact released version (the workspace `package.json` keeps a range so pnpm
can install before the version exists). The pipeline publishes the platform
packages before the bundles for the same reason. A range here let `npx eser`
load ajan 4.1.57 under eser 4.5.1 and fail on missing exports.


## Changelog Generation

Scope: Release automation

Rule: `changelog-gen.ts` parses conventional commits since the last tag, deduplicates
"take" series (e.g., "feat: x (take II)" collapses with "feat: x"), and groups by
Keep-a-Changelog sections. Idempotent — replaces existing sections for the same version.

---

## Re-Release, Resume and Unrelease

Scope: Failed release recovery

Rule: a failed release is resumed, not re-tagged. Every publish step is
idempotent — `deno publish` skips versions already on JSR, the npm steps skip
versions already on the registry, release notes edit an existing GitHub
Release, asset upload clobbers — so the chain can be run again for the same
tag without any of them doing harm.

**Resume (preferred).** Run the Integrity Pipeline via `workflow_dispatch` with
`tag` set to the existing tag (for example `v4.5.1`) and `stage` left at
`post-publish`. Validate, the smoke tests and the registry publish are
skipped; release notes, binaries, asset upload, ajan platform packages,
Homebrew and Nix run against the tag's tree. Nothing touches git. Use
`stage: full` to also re-run validation and the (idempotent) publish, for
example after configuring an npm trusted publisher so the missing platform
packages get published.

```bash
gh workflow run "Integrity Pipeline" -f tag=v4.5.1 -f stage=post-publish
```

**Rerelease.** `eser codebase rerelease` deletes the current version tag and
recreates it at HEAD, re-firing the whole run. It is only needed when the fix
required a commit. Because JSR is immutable, any package that already
published at this version keeps the OLD tree; rerelease at the same version is
therefore legal only when the commit changes nothing that has already been
published (tooling, workflow, an unpublished package). A change to a published
package needs a new patch version.

**Unrelease.** `eser codebase unrelease` deletes the tag and the GitHub
Release; the release commit stays in history. `eser codebase release same`
cuts a fresh release at the current version without a bump.

| Situation | Action |
| ----------------------------------------------------------- | ----------------------------------------------- |
| A stage after publish failed, no code change needed | Resume via `workflow_dispatch`, `post-publish` |
| Infrastructure error (runner, network, rate limit) | Resume, or re-run the failed jobs |
| Fix touches only tooling, workflow or an unpublished package | Commit, then `rerelease` at the same version |
| Fix touches a package already on JSR or npm at this version | Commit, then `release patch` |
