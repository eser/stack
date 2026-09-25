# GitHub Actions

Conventions for the workflows in `.github/workflows/` and for inspecting runs
with `gh`. The release chain inside `build.yml` is described in
release-process.md.

---

## Workflows in This Repository

Scope: Knowing what runs where

| Workflow                  | Trigger                                                    | Purpose                                                                            |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `build.yml`               | push, pull_request, `v*` tags, manual                      | The Integrity Pipeline: validation, preflight on `main`, the full release on a tag |
| `publish-ajan.yml`        | manual                                                     | Builds, or bootstraps, the `@eserstack/ajan-*` npm packages outside the pipeline   |
| `codeql.yml`              | push and pull_request to `main`, weekly                    | CodeQL analysis                                                                    |
| `pr-labeler.yml`          | pull_request                                               | Labels pull requests from `.github/pr-labeler.yml`                                 |
| `sync-issue-labels.yml`   | push to `main` changing `.github/issue-labels.yml`, manual | Syncs the issue label set                                                          |
| `update-contributors.yml` | weekly, manual                                             | Refreshes the contributors list                                                    |

Changing any workflow is an Ask First action (workflow-practices: Ask First).

---

## Inspect Before Acting

Scope: Debugging CI, merging, re-running jobs

Rule: Read the current state before changing anything. Use `gh`, not raw API
calls with a token.

```bash
gh run list --workflow build.yml --limit 5
gh run view <run-id> --log-failed    # only the failing steps
gh pr checks <number>                # before any merge
```

Re-run a failed release stage through `workflow_dispatch` with a tag instead of
re-pushing the tag (release-and-ci: Re-Release, Resume and Unrelease).

---

## Job Settings

Scope: Every job in every workflow

Rule:

- **Timeouts:** every job sets `timeout-minutes`, sized to that job rather than
  a blanket default. `build.yml` uses 5 minutes for gate and update jobs, 10 to
  20 for validation and tests, and 30 for asset upload.
- **Runners:** use the labels the pipeline already uses:
  `ubicloud-standard-*-arm` or `ubuntu-24.04-arm` for Linux work, `macos-latest`
  and `windows-latest` only for jobs that need that platform. A new runner type
  is a workflow change and needs approval.
- **Actions** are pinned to a major version tag (`actions/checkout@v7`), never
  to a branch such as `@main`.
- **Concurrency:** superseded branch runs are cancelled; runs on `main`, on tags
  and resumed release runs never are, because cancelling between `publish` and
  `upload-assets` leaves a released version without binaries.
- **Manual entry:** a workflow that may need a re-run for an existing ref offers
  `workflow_dispatch` with the inputs that run needs.

**Why:** a job without a timeout holds a runner for six hours when it hangs, and
a cancelled release run cannot be rolled back.

---

## Permissions Ceiling

Scope: `permissions` in every workflow

Rule: Workflow-level `permissions` is the ceiling and grants only what the
most-privileged job needs. Each job narrows it to what that job uses. In
`build.yml` the workflow grants `contents: write` and `id-token: write` for
releases and OIDC publishing, and jobs that only read declare `contents: read`.

---

## Fork Pull Requests Pass Without Secrets

Scope: Jobs that run on `pull_request`

Rule: A pull request from a fork runs without repository secrets. Every job that
gates a pull request must pass without them. A step that needs a secret (the
Codecov upload in `validate`) is skipped or non-failing when the secret is
empty, and the checks that judge the code do not depend on it.
