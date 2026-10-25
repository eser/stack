---
name: release-and-ci
description: "Release and CI conventions of this codebase: one shared version, eser codebase release, tag-driven npm publishing over OIDC, release binaries and install channels, changelog and migration entries, GitHub Actions, Dockerfiles, ArgoCD deploys. Use when bumping a version, cutting or recovering a release, writing a changelog, editing an install script, workflow or Dockerfile, fixing CI or deploying."
---

# Releases and CI

How this codebase versions, releases and publishes a package family, and how its
workflows, images and deployments run. Facts that differ between codebases
(workflow file and job names, publish targets, runner labels) are in this
codebase's `AGENTS.md` or the docs it links.

## Always

- The packages of a family share one version (a root `VERSION` file); never edit
  a version by hand
- `eser codebase release <patch|minor|major|same>` bumps, writes the changelog,
  commits, pushes and pushes the tag. Only the user starts a release: run it
  when the user asks for one, on a clean, pushed tree after the full gate and
  the release preflight, and never suggest or offer one
- The version tag push starts the release in CI; CI never creates tags. A
  version that reached a registry is never retagged: resume the run or cut a new
  patch
- Commit subjects are the changelog: user-facing, typed and scoped, one line
  with no body. Breaking changes get `!`, a `### Migration` entry and a README
  example
- Registry publishing is OIDC with provenance; no long-lived registry token
  exists
- Install channels (install scripts, Homebrew, Nix, self-updaters) decide from
  the archives a release has, never from what is merged; an archive name that
  installed binaries update from is never dropped without the owner
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

| File                                                  | Read when                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [release-process.md](references/release-process.md)   | Cutting, verifying or recovering a release, choosing a bump, changelog or migration entries, publish targets, binaries and install channels |
| [github-actions.md](references/github-actions.md)     | Editing a workflow or job, or debugging a CI run                                                                                            |
| [container-images.md](references/container-images.md) | Writing or reviewing a Dockerfile, choosing a base image                                                                                    |
| [deployments.md](references/deployments.md)           | Inspecting a cluster, deploying a service, or mapping tags to environments                                                                  |
