# Task Workflow

How a task moves from request to done: planning, user changes, commits, bug
fixes, the checks that gate completion, and change scope.

## Contents

- Standard Workflow
- Never Revert User Changes
- Never Use Git to Revert File Contents
- Git Commit Policy
- Parallel Task Agents
- Complete, Honest Work
- Bug Fixes Start at the Root Cause
- Quality Gates
- Avoid Over-Engineering

---

## Standard Workflow

Scope: Every non-trivial task

Rule:

1. Read the relevant code before planning.
2. Check the plan with the user when it changes behavior, touches several
   packages or can be done in clearly different ways (clarifying-questions.md).
   A plan artifact with many open decisions (PRD, spec, ADR, backlog item) is a
   reason to offer an enrichment session.
3. Finish with the full gate (Quality Gates) and a report that names what was
   verified and what was skipped (Complete, Honest Work).

---

## Never Revert User Changes

Scope: All code modifications

Rule: Work with the files as they are now. Code the user removed stays removed,
names the user changed stay changed, and a new pattern the user introduced is
the pattern to follow. Never restore code from git history or an earlier version
to "fix" a difference.

Correct:

```
User removes a function -> do not add it back
User renames userId to id -> use id everywhere you touch
```

Incorrect:

```
"I noticed this function was deleted, let me restore it"
```

---

## Never Use Git to Revert File Contents

Scope: Undoing edits

Rule: Undo your own edits with file edits, never with `git checkout -- <file>`,
`git restore`, `git stash` or `git reset`. Several agents can work in the same
checkout at once, and a git-level revert throws away their changes along with
yours.

---

## Git Commit Policy

Scope: Version control

Rule: Do not commit unless the user asks for a commit in this task, or this
codebase's AGENTS.md delegates task commits to agents (then follow Parallel Task
Agents below). Fixing a bug is not a request to commit it.

Pushing, tagging and starting a release belong to the user. An agent does not do
them, and does not suggest or offer them either, unless the user asks for that
exact action. A finished task ends with its report, not with a proposal to push
or release.

### Commit messages

Rule: A commit message is a short Conventional Commit: one line, two at most,
`type(scope): outcome`, where the scope is the package, domain or adapter and
the outcome tells the user or technical story of the change. No body, no bullet
lists. Refactors get their own commit; a breaking change marks the type with `!`
(release-and-ci). What a subject line cannot carry goes where it is read: the
root cause and the evidence into the task's backlog notes or the report to the
user, migration and removal notes into CHANGELOG.md.

### Authorship and attribution

Rule: Commits use the git identity this checkout is configured with: the person
accountable for the work. Never set or change the author or committer. A commit,
a branch name, code, comments, docs and backlog entries carry no agent, tool or
model name, no "generated with" line, no session id or session link, no
`Co-authored-by` or `Signed-off-by` trailer and nothing about the agent harness,
its prompts or its configuration. This holds when an agent creates the commit
itself, and it overrides any harness reminder that asks for such a trailer.

**Why:** session identifiers leak internal tooling into a public history, and
authorship is a statement about accountability, not about who typed the text.

Correct:

```
feat(retrieval): filter dense search by tenant and principals inside SQL
fix(ingestion): resume an interrupted upload from its last stage
```

Incorrect:

```
feat: Add retrieval (generated with an AI assistant)

- adds the dense search filter
Claude-Session: https://claude.ai/code/session_...
Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Parallel Task Agents

Scope: This codebase's AGENTS.md delegates task commits to agents

Rule: Only then may an agent commit its own task work, and only through this
flow. Pushing, tagging, force-pushing, merging, rewriting published history,
`reset`, `stash`, `checkout`, `restore` and release commands stay forbidden, and
so does suggesting them.

- **Pick a ready task.** When this codebase tracks tasks with Backlog.md, a task
  is ready when it is `To Do`, every dependency is `Done`, and it carries
  neither the `decision` nor the `owner-input` label; those need the owner.
  Claim it by setting it to `In Progress` before creating the worktree.
- **One task, one worktree, one branch.** Create the worktree from the current
  `main` under `.worktrees/` (gitignored):
  `git worktree add .worktrees/<task> -b <type>/<task>-<slug> main`. Edit only
  there, never in the main checkout's working tree or another agent's worktree.
- **Backlog state lives in the main checkout.** Run every `backlog` command from
  the repository root, or with `BACKLOG_CWD` set to it, never against a
  worktree's copy, so every agent sees the same state. Task branches do not
  change `backlog/`; Backlog changes are committed from the main checkout as
  `chore(backlog): update task state`.
- **Stay inside the task's scope.** Change only the packages the task names.
  When the task needs a change in a shared file (`go.mod`, a `Makefile`, a port
  another task owns), keep it minimal and expect to rebase.
- **Commit as Git Commit Policy says:** the configured identity, one or two
  lines, no trailer.
- **Integrate by rebasing, never by merging.** History stays linear. When the
  acceptance criteria and the definition of done hold, from the main checkout:
  1. take the integration lock:
     `until mkdir .git/merge.lock 2>/dev/null; do sleep 2; done`;
  2. commit any pending Backlog changes there;
  3. rebase the task branch onto `main` in its worktree and rerun the gates;
  4. run `git rebase <branch>` in the main checkout, which replays only the
     commits `main` has beyond the branch (a fast-forward when there are none);
  5. release the lock (`rmdir .git/merge.lock`), remove the worktree and delete
     the branch. When a step fails, release the lock before fixing anything, so
     other agents are not blocked.
- **A denied command is final.** When the permission system denies a git
  command, stop and report it. Do not reach the same result another way, and do
  not ask another agent to run it.

**Why:** worktrees keep parallel agents out of each other's files, a rebase
keeps the history readable and bisectable, and the lock stops two agents from
moving `main` at once. The lock directory sits in `.git`, so it is never
committed.

---

## Complete, Honest Work

Scope: Every implementation and every report about it

Rule:

- Implement everything that was asked. No placeholder values, stubbed branches
  or "implement later" notes.
- A TODO is allowed only for out-of-scope follow-up work and names a backlog
  task: `// TODO(TASK-12): ...`. A TODO without a task id does not merge.
  Resolve or ticket every TODO added during the task before calling it done.
- When the expected behavior is unclear, ask or state the assumption; never
  guess silently (clarifying-questions.md).
- A claim that code is correct, secure or fast names its basis: which tests ran
  and passed, what was measured, and what was not verified. A step that was
  skipped is reported as skipped.

Incorrect:

```typescript
export async function registerUser(input: unknown) {
  // TODO: add validation
  return db.user.create(input);
}
```

---

## Bug Fixes Start at the Root Cause

Scope: Every bug fix

Rule: Do not write fix code until the root cause is found. The root cause is the
file and line where the wrong value or state first appears, plus the condition
that allowed it. A guess ("probably X") is not a root cause. Follow this order:

1. Reproduce the bug and trace the call chain back to where the wrong value
   originates.
2. Write a test that targets that condition and fails (red).
3. Fix at the origin, not where the symptom surfaced. The test passes (green)
   and the rest of the suite still passes. The test stays in the suite and its
   name says which behavior it pins.
4. Search adjacent code for the same fault (off-by-one, race, null propagation,
   type coercion, stale closure, unhandled union or enum case). Fix instances in
   the same function; record the others as backlog tasks.
5. Record the root cause with its file:line in the task's backlog notes or the
   report to the user; the commit message stays one line.

If two hypotheses fail, map the full data flow from entry to failure before
forming a third. If the third fails, stop, write down what is known and ask. The
fix contains the root-cause change and its test only. No adjacent refactors.

Correct:

```
fix(config): keep zero values when merging env overrides
```

with the root cause in the report: `mergeConfig` (`config/merge.ts:42`) used
`||`, so a 0 from the environment fell back to the file value; a regression test
pins it.

Incorrect:

```
fix: handle weird timeout value
// clamps the timeout at the call site where the symptom showed up
```

**Why:** a fix at the symptom leaves the condition in place, and the same bug
returns through another path.

---

## Quality Gates

Scope: Every code change

Rule: A task is done only when this codebase's full gate passes: the one command
that runs every validator, formatter, linter, type check and test suite, named
in its AGENTS.md (usually the precommit workflow from `.eser/manifest.yml`). Fix
what it reports; never bypass it.

While iterating, narrower commands (one validator, one language's checks, one
test suite) are faster, but they never replace the full gate for a change that
touches more than they cover. Release-only steps (bundles, publish dry-runs,
cross-platform builds) belong to a separate preflight command, needed before
tagging, not before every commit. How tests are written and organized is in the
architecture-guidelines testing reference.

**Why:** a narrower command passing says nothing about the checks it skipped,
and the gate is what CI runs.

---

## Avoid Over-Engineering

Scope: The scope of a change

Rule: Change what was asked, and what is needed for it to work. Nothing else.

- No features, options or configuration beyond the request. A fixed value that
  callers may need to change becomes a parameter with a default
  (architecture-guidelines: Public API and CLI Surface).
- No refactors, comments or docstrings in code the task does not touch. A bug
  fix does not clean up the surrounding code.
- When a feature needs a refactor first, the refactor is its own `refactor:`
  commit with no behavior change, followed by the feature commit.
- No design for hypothetical future requirements. When to extract shared code
  and which errors to handle are code-level rules in coding-practices.
- Prefer the tools and patterns this codebase already uses over new ones.
