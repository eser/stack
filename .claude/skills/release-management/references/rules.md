# Release Management - Detailed Rules

## Pre-Release Checklist

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

## Changelog Generation

Scope: Release automation

Rule: `changelog-gen.ts` parses conventional commits since the last tag, deduplicates
"take" series (e.g., "feat: x (take II)" collapses with "feat: x"), and groups by
Keep-a-Changelog sections. Idempotent — replaces existing sections for the same version.

---

## Re-Release and Unrelease

Scope: Failed release recovery

Rule: `eser codebase rerelease` deletes the current version tag and recreates it at
HEAD, re-firing the whole release run. `eser codebase unrelease` deletes the tag and
the GitHub Release; the release commit stays in history. `eser codebase release same`
cuts a fresh release at the current version, without a bump.

**Never retag a version that already reached a registry.** JSR is immutable — a
published version can only be yanked, never replaced — and npm answers a republish
with 403. A same-version rerelease is legal only while `publish` and `publish-ajan`
have written nothing, which is the common case when the run died in `release-gate`,
`smoke-test` or `npm-no-deno-test`.

Once either publish job has written anything:

| Cause | Action |
|-------|--------|
| Infrastructure error (runner, network, rate limit) | Re-run the failed jobs |
| Anything needing a code or metadata change | Cut a new patch version |
