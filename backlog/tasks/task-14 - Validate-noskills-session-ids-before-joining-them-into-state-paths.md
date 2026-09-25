---
id: TASK-14
title: Validate noskills session ids before joining them into state paths
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - noskills
dependencies: []
references:
  - pkg/@eserstack/noskills/state/persistence.ts
  - pkg/@eserstack/noskills/commands/manager.ts
  - security-report.md
priority: medium
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: medium (likelihood low, impact medium). Fingerprint: noskills/persistence/session-id-path-join. Full record, bounded reproduction and proposed code are in security-report.md.

pkg/@eserstack/noskills/state/persistence.ts builds every session file path as `${root}/.eser/.state/sessions/${sessionId}.json` with no check on the id. listSessions returns the `id` field parsed from each `*.json` in that directory rather than the file name, and gcStaleSessions deletes stale entries by that embedded id. A repository that adopts noskills commits `.eser/` (manifest, gitignore); an author of such a repository can also commit `.eser/.state/sessions/<any>.json` containing `"id": "../../../../victim"` and an old `lastActiveAt` (the scaffolded `.eser/.gitignore` only stops a plain `git add -A`; `git add -f` commits it and every clone checks it out with the .gitignore intact). When an operator runs `noskills manager` in that checkout and quits (commands/manager.ts:300) or runs `noskills session gc` (commands/session.ts:287), the CLI removes `<four levels above the project>/victim.json`. Because gc deletes by the embedded id, the malicious file itself is never removed and fires on every subsequent gc. The same join serves readSession and updateSessionPhase, so a traversing NOSKILLS_SESSION value reads and rewrites any parseable JSON file (adding `phase` and `lastActiveAt`); that entry is reachable only by principals that already own the process environment (the bearer-token holder can set pane.meta.sessionId, but can also open a `$SHELL` pane), so the boundary crossing is the repository-content one. Verified by an independent sandboxed run against the unmodified module.

Root cause: persistence.ts has no session-id validation and no binding between a session file's name and its `id`: createSession:826, readSession:837, deleteSession:876 and updateSessionPhase:897 interpolate the id straight into the path, listSessions:858 pushes the parsed file content as the Session, and gcStaleSessions:912 deletes by the `id` taken from repository-controlled file content rather than by the file it read. The Go twin (pkg/ajan/noskillsfx/session.go:188-207 with persistence.go:106 `filepath.Join(p.SessionsDir, sessionID+".json")`) shares the pattern but has no caller today.

Intended behaviour: Session ids are the 8-hex-character values produced by generateSessionId (persistence.ts:925-930); any id must resolve to a regular file directly inside `.eser/.state/sessions/`, and garbage collection must remove only the file it read, never a path named inside that file.

Trace:
1. entrypoint pkg/@eserstack/noskills/state/persistence.ts:845 (listSessions): Reads every `*.json` under `<root>/.eser/.state/sessions/` and JSON-parses it as a Session (push at line 858); the `id` field comes from repository content, which a cloned third-party project can carry as a tracked file regardless of the scaffolded .eser/.gitignore.
2. propagation pkg/@eserstack/noskills/state/persistence.ts:909 (gcStaleSessions): For every session whose lastActiveAt is older than STALE_THRESHOLD_MS (2h, line 817), calls deleteSession(root, s.id) at line 912 with the file-supplied id; the file that was read is not itself removed.
3. propagation pkg/@eserstack/noskills/commands/manager.ts:300 (manager command finally block): The TUI manager calls persistence.gcStaleSessions(root) unconditionally on every exit; `noskills session gc` (commands/session.ts:287) calls it explicitly. root is the nearest ancestor of cwd that contains `.eser/` (persistence.ts:963-978, 989-1018), i.e. the project checkout.
4. sink pkg/@eserstack/noskills/state/persistence.ts:876 (deleteSession): runtime.fs.remove(`${root}/${SESSIONS_DIR}/${sessionId}.json`) with sessionId = `../../../../victim`, removing a file outside the sessions directory and outside the project.

Conditions:
- data_state: The project checkout contains `.eser/` (so root resolution selects it) and `.eser/.state/sessions/<name>.json` whose `id` holds `..` segments and whose lastActiveAt is more than two hours old; a repository author commits this file with `git add -f` (or without the scaffolded .eser/.gitignore), and it is checked out in every clone.
- user_interaction: The operator runs `noskills manager` (and quits) or `noskills session gc` with that checkout as the project root; for the rewrite variant, a process in that checkout runs `noskills next` with a crafted NOSKILLS_SESSION, which only a principal that already controls the environment can set.
- environmental_dependency: The target file must end in `.json` and be deletable (for the rewrite variant, parseable as JSON and writable) by the operator; the path is relative to `<root>/.eser/.state/sessions/`, so the attacker must guess the checkout's depth relative to the target (for example four levels up reaches the parent of `~/projects/<org>/<repo>` layouts).

Observed in the audit sandbox: plain `git add -A` stages the session file: false; author tracked files: .eser/.gitignore, .eser/.state/sessions/evil.json, .eser/manifest.yml; clone has .eser/.state/sessions/evil.json: true with `.state/` still in the clone's .eser/.gitignore; traversing id resolves to /scratch/v29/victim.json (outside clone: true); before gc: victim exists=true; gcStaleSessions(clone) removed=["../../../../victim"]; after gc: victim exists=false ; evil.json still present=true; readSession(clone,'../../../../victim2') -> {"keep":true}; victim2 after updateSessionPhase: { "keep": true, "phase": "EXECUTING", "lastActiveAt": "2026-09-19T07:16:43.947Z" }; generateSessionId sample=db912b5c. Container exit 0.

Fix strategy: Validate the session id once, in persistence.ts, before it becomes a path component, and make garbage collection delete the file it read rather than a path named inside it. Reject anything outside a short safe alphabet; the ids the code generates are 8 hex characters, and the daemon sid also passes through here, so `^[A-Za-z0-9_-]{1,64}$` keeps both working while excluding `/`, `\`, `.` and NUL. In listSessions derive the id from the file name and skip files whose embedded id disagrees. Mirror the same check in pkg/ajan/noskillsfx (SessionFile at persistence.go:106 and GcStaleSessions at session.go:188-207), which shares the pattern even though nothing calls it yet.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: Session ids are the 8-hex-character values produced by generateSessionId (persistence.ts:925-930); any id must resolve to a regular file directly inside `.eser/.state/sessions/`, and garbage collection must remove only the file it read, never a path named inside that file.
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/noskills/state/persistence.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/@eserstack/noskills/state/persistence.ts: new isValidSessionId (1-64 chars of [A-Za-z0-9_-]; generateSessionId still makes 8 hex chars, and the wider set keeps the hand-picked ids in existing tests working) and a sessionPath helper that throws on an invalid id. createSession, readSession, deleteSession and updateSessionPhase go through it. readSession and deleteSession return null/false for an invalid id instead of touching the path, and listSessions takes the file name as the identity: it skips files whose name is not a valid id or whose embedded id differs. gcStaleSessions therefore deletes only the file it read and can no longer be steered by a committed .eser/.state/sessions file. The Go twin (pkg/ajan/noskillsfx/session.go) got the same rule: ValidSessionID, ErrInvalidSessionID from CreateSession/DeleteSession, and ReadSession/ListSessions ignore a file whose id differs from its name. Regression: state/session-id.test.ts (planted '../../../victim' session survives gc, direct delete/read/create of traversal ids are refused, a normal stale session is still collected; fails on the committed persistence.ts) and noskillsfx/session_path_test.go. Existing commands/session.test.ts still passes.
<!-- SECTION:NOTES:END -->
