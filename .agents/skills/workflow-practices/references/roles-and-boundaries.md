# Roles and Boundaries

What an agent may do on its own, what needs the user's approval, and who owns
which area.

## Contents

- Agent Roles
- File Ownership
- Never Do
- Ask First
- Language
- Cross-Package Change Protocol

---

## Agent Roles

Scope: Every agent task

Rule: An agent works in one role at a time.

- **Implementer:** changes code inside one package, follows that package's
  conventions (tooling-standards, this codebase's AGENTS.md), writes tests, and
  runs the full gate before calling the work done.
- **Reviewer:** reads and reports; changes nothing.
  - Reports semantic issues. Formatting and lint-level issues are left to the
    formatter, the linter and the validators.
  - Marks each finding blocking or informational. Blocking: injection, missing
    authorization, unsynchronized shared state, non-exhaustive branching,
    untrusted input reaching a prompt or subprocess, secrets in output.
    Everything else is informational.
  - Cites file:line for every finding. Before merge each finding is fixed,
    deferred to a backlog task, or accepted with a reason; no blocking finding
    stays open.
- **Architect:** plans cross-package or structural changes with the
  cross-package protocol below, reads this codebase's architecture document for
  the package layers, and records significant decisions as ADRs
  (architecture-guidelines).

---

## File Ownership

Scope: Deciding whether a change stays inside its area

Rule: A task stays inside the area it was given. This codebase's AGENTS.md or
its linked docs name the areas and which of them are high impact (shared
foundations every package depends on, CI/CD workflows, publishing
configuration); a high-impact area needs the Ask First step before any change.
When no document names them, treat the shared base package, the CI configuration
and anything that is published as high impact.

**Why:** a change in a shared or published area reaches every consumer at once,
and it is the one an agent is least able to judge from inside a single task.

---

## Never Do

Scope: All agent actions

Rule: These are forbidden unless the user asks for that exact action in the
current task. A general "go ahead" does not cover them.

- **Git history and working tree:** no `commit`, `push`, `tag`, `reset`,
  `rebase`, `checkout`, `restore`, `stash` or force push. The user commits and
  pushes. When the user asks for a commit, it follows task-workflow.md: Git
  Commit Policy: the configured identity, one or two lines, no attribution and
  no session ids. When this codebase's AGENTS.md delegates task commits to
  agents, the worktree, commit and rebase steps of task-workflow.md: Parallel
  Task Agents are allowed, and nothing else on this list.
- **Push, tag and release decisions:** the user starts every push, tag and
  release. An agent does not decide on one, and does not suggest or offer one at
  the end of a task either.
- **Release commands:** `eser codebase release`, `rerelease` and `unrelease`
  commit, push and push tags. Run them only when the user asks for a release
  (release-and-ci).
- **Versions:** never edit a `version` field by hand; the release command bumps
  every version together.
- **Generated files:** never edit a generated file; change its source and run
  its generator (a bundle's `dist/package.json` is built from its
  `package.json`). Lock files (`pnpm-lock.yaml`, `go.sum`) change only through
  their tools.
- **Lockfile and root manifest:** while this codebase's AGENTS.md names an
  integration agent, only that agent edits `pnpm-lock.yaml` and the root
  `package.json` and lands dependency changes; every other agent sends it the
  request and never runs `pnpm install`, `pnpm add` or `pnpm remove`
  (tooling-standards: Lockfile and Root Manifest Owner).
- **Checks:** the git hooks run the full gate named in this codebase's
  AGENTS.md. Never skip them (`--no-verify`) and never weaken TypeScript types
  to make a check pass. Only the owner turns the hooks off, for a whole branch;
  on such a branch each agent still runs the tests, the type check and the
  linter of every package it changed before handing the work over.
- **Secrets:** never commit `.env` files, keys or tokens.
- **Scope:** do not modify files outside the assigned package.

Stop and reconsider when the plan includes "just this once I'll skip the
checks", "this change is too small for a test", "I'll fix the types later" or
"it is only one version field".

**Why:** these actions are either irreversible (a pushed tag starts a publish
that a registry never forgets) or hide a problem the checks exist to catch.

---

## Ask First

Scope: Actions that need the user's confirmation

Rule: Describe the change and wait for approval before:

- adding an import between workspace packages that did not depend on each other
  before;
- adding an external dependency (npm package or Go module), with the purpose,
  license and alternative from tooling-standards: Adding a Dependency;
- changing CI/CD workflows;
- changing a high-impact area (File Ownership);
- changing publishing configuration (the `exports`, `files`, `bin` and
  `publishConfig` fields of a `package.json`);
- removing or deprecating a public API;
- anything a later release cannot undo: persisted file or ledger formats, and
  package names or exports already published to a registry.

---

## Language

Scope: Everything written into this codebase

Rule: Source code, comments, documentation, commit messages, backlog items,
ADRs, task plans and release notes are written in English, whatever language the
conversation uses. A Turkish request produces English files. Never translate a
rule, comment or backlog item into the conversation language, and never leave a
non-English fragment in a file because the user wrote it that way.

**Why:** repositories have external readers, and their tooling (validators,
changelog generation, release notes) parses these files.

---

## Cross-Package Change Protocol

Scope: A change that spans more than one workspace package

Rule:

1. **Justify:** say why the packages must change together. One package per
   change is the default.
2. **Plan:** list each affected package and its part of the change.
3. **Order:** change dependencies before dependents, following the layers in
   this codebase's architecture document: foundations first, then core utilities
   and infrastructure, then frameworks, and shipped binaries last.
4. **Test:** run the full gate after all packages are changed.
5. **Version:** when all packages share one version, no per-package bump is
   needed; the next release carries the change.
