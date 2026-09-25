---
id: TASK-16
title: 'Write the posts token store owner-only (0700 directory, 0600 file)'
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - posts
dependencies: []
references:
  - pkg/@eserstack/posts/adapters/cli/commands/login.ts
  - pkg/@eserstack/posts/adapters/cli/wiring.ts
  - pkg/@eserstack/posts/adapters/token-store/file-token-store.ts
  - security-report.md
priority: medium
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: medium (likelihood low, impact high). Fingerprint: posts/file-token-store/world-readable-mode. Full record, bounded reproduction and proposed code are in security-report.md.

FileTokenStore.save writes <home>/.eser/posts/tokens.json with the runtime default file mode (0o666 masked by umask) and creates .eser and .eser/posts with the default directory mode (0o777 masked by umask). Under the common umask 022 the file is 0644 and the directories 0755, so any other local OS account or other-uid process on the same host that can traverse the user's home directory can read the plaintext Twitter OAuth 2.0 access and refresh tokens (scopes tweet.read, tweet.write, users.read, bookmark.write, offline.access) and the Bluesky session and refresh JWTs obtained from the account app password. The daemon's auth.json and the Go postsfx token store in the same repository write the equivalent secrets with 0700 directories and 0600 files, so this store is the one credential writer without the owner-only policy. Independently reproduced in the sandbox: the real store under Node 26 with umask 022 produced 755/755/644 and a uid 65534 process read both dummy token pairs.

Root cause: writeStore in pkg/@eserstack/posts/adapters/token-store/file-token-store.ts (lines 79-91) calls runtime.fs.ensureDir(dir) and runtime.fs.writeTextFile(tokenPath, json) with no mode option, never chmods the result, and does not write through a temp file plus rename. Both cross-runtime adapters forward mode: undefined to Node fs.promises.writeFile (node-shared.ts:113) and Deno.writeTextFile (deno.ts:120), and ensureDir is a bare recursive mkdir in both (node-shared.ts:153, deno.ts:171), so the OS default permissions apply.

Intended behaviour: Persisted OAuth tokens must be readable only by the account that logged in: the token directory created 0700 and the token file created and kept 0600 independent of the process umask, matching pkg/ajan/noskillsserverfx/auth.go and pkg/ajan/postsfx/tokenstore.go.

Trace:
1. entrypoint pkg/@eserstack/posts/adapters/cli/commands/login.ts:79 (main (eser posts login)): After auth.loginWithCredentials returns the platform session (Bluesky accessJwt and refreshJwt, or Twitter access and refresh tokens from the TUI OAuth flow at adapters/tui/menu.ts:351 and the refresh path at application/with-fresh-tokens.ts:83), the command calls tokenStore.save(p, tokens).
2. propagation pkg/@eserstack/posts/adapters/cli/wiring.ts:108 (createAppContext): Constructs new FileTokenStore(cfg.tokenStorePath); with POSTS_TOKEN_STORE_PATH (config.ts:99) unset the store resolves <home>/.eser/posts/tokens.json from HOME or USERPROFILE (file-token-store.ts:28-37, shared.ts:282-292).
3. propagation pkg/@eserstack/posts/adapters/token-store/file-token-store.ts:110 (FileTokenStore.save): Merges the new entry into the parsed store and calls writeStore(this.tokenPath, store) with access and refresh tokens serialized as plaintext JSON (serialize, lines 60-70).
4. propagation pkg/@eserstack/posts/adapters/token-store/file-token-store.ts:86 (writeStore): runtime.fs.ensureDir(dir) creates .eser and .eser/posts with no mode: node-shared.ts:152-154 mkdir({recursive:true}) and deno.ts:171 Deno.mkdir(path, {recursive:true}), giving 0755 under umask 022.
5. sink pkg/@eserstack/posts/adapters/token-store/file-token-store.ts:87 (writeStore): runtime.fs.writeTextFile(tokenPath, JSON.stringify(store, null, 2)) with no options; node-shared.ts:104-116 forwards mode: undefined and flag 'w' to fs.promises.writeFile and deno.ts:113-122 forwards mode: undefined to Deno.writeTextFile, so the token file is created 0644 under umask 022 and no chmod follows.

Conditions:
- authentication_level: Attacker is any other local OS account, or any process running under a different uid (service accounts, sandboxed helpers), on the same host as the logged-in user; no eser credential or privilege is needed.
- system_configuration: POSIX host where the process umask is the common 022 and the user's home directory is traversable by the attacker's uid. On the audited macOS 27 host the home is drwxr-x--- owner:staff (750) with umask 022: every local user account is in staff, so other local accounts can traverse and read the 644 file, while non-staff service uids cannot. Older macOS and many Linux distributions create 755 homes (fully exposed); several newer Linux distributions create 750 or 700 homes, which blocks the read.
- data_state: The user has run eser posts login or the TUI login flow at least once so tokens.json exists; POSTS_TOKEN_STORE_PATH unset or pointing at an equally exposed location.
- environmental_dependency: On Windows the mode option is ignored by both runtimes and the file inherits the profile ACL, so the finding is POSIX-specific; the Deno runtime path was established from source only (deno.ts:120, 171), not executed, because no Deno image exists in the sandbox.

Observed in the audit sandbox: umask: 22 uid: 0; /scratch/.eser mode 755 uid 0; /scratch/.eser/posts mode 755 uid 0; /scratch/.eser/posts/tokens.json mode 644 uid 0; su as nobody exited 0 and printed 65534 followed by the complete JSON containing DUMMY-ACCESS-TOKEN-V36, DUMMY-REFRESH-TOKEN-V36, DUMMY-BSKY-ACCESS-V36 and DUMMY-BSKY-REFRESH-V36. This independently matches the hunter's promoted artifact agents/w9-posts-token-store/artifacts/check-mode.txt (755/755/644, uid 65534 read succeeded).

Fix strategy: Create the token directory 0700 and the token file 0600 independent of umask, chmod the existing directory and file so already-created 0755/0644 stores are repaired on the next save, and write through a temp file plus rename so a crash cannot leave a truncated or partially written store. All primitives (mkdir with mode, chmod, rename, writeTextFile with mode) already exist on the cross-runtime fs interface. Regression test (deno test or node): after save() with umask 022, stat(dir).mode & 0o777 === 0o700 and stat(file).mode & 0o777 === 0o600, and a pre-existing 0644 file becomes 0600 after save(). Consider the same owner-only treatment for clear(), which rewrites the file through writeStore.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: Persisted OAuth tokens must be readable only by the account that logged in: the token directory created 0700 and the token file created and kept 0600 independent of the process umask, matching pkg/ajan/noskillsserverfx/auth.go and pkg/ajan/postsfx/tokenstore.go.
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/posts/adapters/token-store/file-token-store.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
writeStore in pkg/@eserstack/posts/adapters/token-store/file-token-store.ts now creates the directory with mode 0700 and writes the store through a sibling temp file created with mode 0600, then renames it over tokens.json. mode only applies at creation, so on POSIX both the directory and the temp file are also chmod'ed. That repairs stores an earlier version left at 0755/0644, and the file is never readable by others before its mode is set. The temp file is removed if a step fails. Windows skips chmod (POSIX modes do not apply; the profile ACL protects the file). This matches the daemon's auth.json and the Go postsfx store. Regression: adapters/token-store/file-token-store.test.ts asserts 0700/0600 after save and after saving over a 0755/0644 store, that load still works, and that no temp file is left behind. It fails on the committed store and passes now.
<!-- SECTION:NOTES:END -->
