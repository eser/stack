---
name: release-and-ci
description: Releases and CI for eserstack: the shared version of all packages, the release command, the tag-driven build.yml run, JSR and npm publishing, changelog and breaking changes, release recovery, GitHub Actions workflows, and Kubernetes and ArgoCD deploys. Use when bumping a version, cutting or recovering a release, writing changelog entries, editing a workflow, debugging CI or deploying.
---

# Releases and CI

How eserstack versions, releases and publishes its packages, and how its
workflows and deployments run.

## Always

- Every package shares the version in `VERSION`; never edit a version by hand
- `deno task cli codebase release <patch|minor|major|same>` bumps, writes the
  changelog, commits, pushes and pushes the tag; run it only when the user asks
  for a release, on a clean, pushed tree after `deno task cli ok` and
  `deno task cli preflight`
- The `v*.*.*` tag push starts the release in `build.yml`; CI never creates
  tags. A version that reached JSR or npm is never retagged: resume the run or
  cut a new patch
- Commit subjects are the changelog: user-facing, typed and scoped. Breaking
  changes get `!`, a `### Migration` entry and a README example
- npm publishing is OIDC with provenance; no npm token exists
- Inspect before acting: `gh run view <id> --log-failed`, `gh pr checks`,
  read-only `kubectl` with an explicit namespace
- Workflow changes need the user's approval
- Every job sets `timeout-minutes`, pins actions to a major version tag and uses
  the runner labels the pipeline already uses
- Never cancel runs on `main`, tags or resumed releases
- Workflow permissions are the ceiling and jobs narrow them; pull request checks
  pass without secrets
- CI pushes images; ArgoCD Image Updater deploys them, with no tag commits

## References

| File                                                | Read when                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [release-process.md](references/release-process.md) | Cutting, verifying or recovering a release, choosing a bump, changelog or migration entries, publish targets |
| [github-actions.md](references/github-actions.md)   | Editing a workflow or job, or debugging a CI run                                                             |
| [deployments.md](references/deployments.md)         | Inspecting a cluster, deploying a service, or mapping tags to environments                                   |
