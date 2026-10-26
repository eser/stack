# GitHub Actions

Conventions for workflows in `.github/workflows/` and for inspecting runs with
`gh`. The release chain is described in release-process.md; this codebase's
workflow list is in the docs its AGENTS.md links.

---

## Inspect Before Acting

Scope: Debugging CI, merging, re-running jobs

Rule: Read the current state before changing anything. Use `gh`, not raw API
calls with a token.

```bash
gh run list --workflow <workflow>.yml --limit 5
gh run view <run-id> --log-failed    # only the failing steps
gh pr checks <number>                # before any merge
```

Re-run a failed release stage through `workflow_dispatch` with a tag instead of
re-pushing the tag (release-and-ci: Re-Release, Resume and Unrelease).

Changing any workflow is an Ask First action (workflow-practices: Ask First).

---

## Job Settings

Scope: Every job in every workflow

Rule:

- **Timeouts:** every job sets `timeout-minutes`, sized to that job rather than
  a blanket default: about 5 minutes for gate and update jobs, 10 to 20 for
  validation and tests, 30 for asset upload.
- **Runners:** use the labels the pipeline already uses for Linux work, and
  `macos-latest` or `windows-latest` only for jobs that need that platform. An
  exception carries its reason in a comment on the job. A new runner type is a
  workflow change and needs approval.
- **Actions** are pinned to a major version tag (`actions/checkout@v7`), never
  to a branch such as `@main`.
- **Concurrency:** superseded branch runs are cancelled; runs on `main`, on tags
  and resumed release runs never are, because cancelling between publishing and
  asset upload leaves a released version without binaries.
- **Manual entry:** a workflow that may need a re-run for an existing ref offers
  `workflow_dispatch` with the inputs that run needs.

**Why:** a job without a timeout holds a runner for six hours when it hangs, and
a cancelled release run cannot be rolled back.

---

## Permissions Ceiling

Scope: `permissions` in every workflow

Rule: Workflow-level `permissions` is the ceiling and grants only what the
most-privileged job needs. Each job narrows it to what that job uses. A release
workflow typically grants `contents: write` and `id-token: write` for releases
and OIDC publishing, and jobs that only read declare `contents: read`.

---

## Fork Pull Requests Pass Without Secrets

Scope: Jobs that run on `pull_request`

Rule: A pull request from a fork runs without repository secrets. Every job that
gates a pull request must pass without them. A step that needs a secret (a
coverage upload, for example) is skipped or non-failing when the secret is
empty, and the checks that judge the code do not depend on it.
