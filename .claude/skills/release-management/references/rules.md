# Release Management - Detailed Rules

## Pre-Release Checklist

Scope: Every release

Rule: Complete all steps in order before merging to main.

1. **Verify clean state:**
   ```bash
   git status                    # Must be clean
   deno task validate            # Must pass
   ```

2. **Bump version:**
   ```bash
   deno run -A pkg/@eser/codebase/versions.ts <patch|minor|major>
   ```

3. **Update CHANGELOG.md:**
   - Move items from `[Unreleased]` to a new version section
   - Add the release date
   - Format: `## [x.y.z] - YYYY-MM-DD`

4. **Commit and push:**
   ```bash
   git add -A
   git commit -m "chore(release): bump version to x.y.z"
   git push origin dev
   ```

5. **Create PR to main:**
   - Title: `release: vx.y.z`
   - Ensure CI passes (integration job)

---

## Release

Scope: After PR is approved

6. **Merge PR to main** — triggers the delivery job:
   - Publishes all packages to JSR via `deno publish` (OIDC auth)
   - Builds and publishes `@eser/cli` to npm with provenance

7. **Tag the release:**
   ```bash
   git tag vx.y.z
   git push origin vx.y.z
   ```

8. **Create GitHub Release:**
   - The `release-notes-sync` workflow syncs CHANGELOG content automatically
   - Or manually: `gh release create vx.y.z --generate-notes`

---

## Post-Release Verification

Scope: After every release

Rule: Verify all publish targets received the new version.

- Check JSR: packages appear at `jsr.io/@eser/<name>` with correct version
- Check npm: `npm info eser` shows new version
- Check GitHub: release notes are correct and complete
- Add `## [Unreleased]` section to CHANGELOG.md for next cycle

---

## Hotfix Process

Scope: Urgent fixes on production

Rule: Hotfixes branch from main, not dev.

1. Branch from main: `git checkout -b hotfix/<description> main`
2. Fix the issue
3. Bump patch version: `deno run -A pkg/@eser/codebase/versions.ts patch`
4. Update CHANGELOG with hotfix entry
5. PR directly to main
6. After merge, cherry-pick or merge back to dev

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

- Triggered by push to `main` branch in CI delivery job
- Uses OIDC token authentication (no secrets needed)
- All packages with `publish` config in `deno.json` are published
- Command: `deno publish`

### npm (Secondary Registry)

- Only `@eser/cli` is published to npm as the `eser` package
- Built via esbuild bundling: `deno task npm-build`
- Published with provenance: `npm publish --provenance --access public`
- Working directory: `pkg/@eser/cli/dist`
- Requires `NODE_AUTH_TOKEN` secret in CI
