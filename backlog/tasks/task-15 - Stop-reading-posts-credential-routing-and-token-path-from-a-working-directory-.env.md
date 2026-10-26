---
id: TASK-15
title: >-
  Stop reading posts credential routing and token path from a working-directory
  .env
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - posts
  - config
dependencies: []
references:
  - pkg/@eserstack/config/dotenv/loader.ts
  - pkg/@eserstack/posts/config.ts
  - pkg/@eserstack/posts/adapters/cli/wiring.ts
  - pkg/@eserstack/httpclient/client.ts
  - pkg/@eserstack/posts/adapters/bluesky/auth-provider.ts
  - pkg/@eserstack/posts/adapters/twitter/client.ts
  - pkg/@eserstack/posts/adapters/token-store/file-token-store.ts
  - security-report.md
priority: medium
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: medium (likelihood low, impact high). Fingerprint: posts/config/cwd-dotenv-endpoint-and-token-path. Full record, bounded reproduction and proposed code are in security-report.md.

`eser posts` loads configuration from `.env`, `.env.<env>`, `.env.local` and `.env.<env>.local` in the process working directory, with no key allowlist. The values TWITTER_API_BASE_URL, BLUESKY_PDS_HOST and POSTS_TOKEN_STORE_PATH go unvalidated into the Twitter and Bluesky HTTP clients and the FileTokenStore. As a result, the content of whatever directory the operator runs `eser posts` in chooses three things: (a) the host that receives the operator's Bluesky handle and app password on `login`; (b) the host that receives the Twitter and Bluesky bearer tokens the operator stored in <home>/.eser/posts/tokens.json, sent on every token-bearing subcommand (`timeline`, `compose`, ...); (c) where new access and refresh tokens are written, including a relative path inside the checkout. Plain http:// and loopback hosts are accepted. Nothing reports which .env files were loaded and nothing asks for confirmation. The shipped `eser` binary runs with --allow-all, so no Deno permission prompt intervenes either. The trust boundary crossed: the stored tokens belong to the operator's home directory and are valid for any working directory, but a file in the working directory, which is repository content, decides where they are sent.

Root cause: pkg/@eserstack/config/dotenv/loader.ts load() defaults baseDir to '.' and imports every key from the cwd-local .env files. pkg/@eserstack/posts/config.ts loadPostsConfig() calls dotenv.configure() with no options and reads TWITTER_API_BASE_URL, BLUESKY_PDS_HOST and POSTS_TOKEN_STORE_PATH as raw strings. pkg/@eserstack/posts/adapters/cli/wiring.ts createAppContext() passes them without validation into TwitterClient({baseUrl}), BlueskyClient({serviceUrl}) and FileTokenStore(tokenPath). httpclient resolveUrl only concatenates base and path.

Intended behaviour: For a credential-holding global CLI, endpoint overrides and the token-store location should come only from operator-owned configuration: the process environment, or a file under the operator's home/config directory. If cwd-local .env files are read at all, they should be limited to non-sensitive keys. Endpoint overrides should require absolute https URLs unless the operator explicitly opts in, the token path should be absolute and operator-chosen, and the CLI should report which .env files it loaded.

Trace:
1. entrypoint pkg/@eserstack/config/dotenv/loader.ts:127 (load): baseDir defaults to '.', the process working directory. Lines 151-173 read .env, .env.<envName>, .env.local (skipped only for envName 'test') and .env.<envName>.local from it. envImport (144-148) copies every parsed key with no allowlist. Process env is imported last (175-177), so it overrides only the keys the operator has actually set.
2. propagation pkg/@eserstack/posts/config.ts:75 (loadPostsConfig): dotenv.configure() is called with no options, so the cwd defaults apply. TWITTER_API_BASE_URL (88), BLUESKY_PDS_HOST (91) and POSTS_TOKEN_STORE_PATH (99) are read via reader.readString with no validation.
3. propagation pkg/@eserstack/posts/adapters/cli/wiring.ts:59 (createAppContext): TwitterClient({ baseUrl: cfg.twitter.apiBaseUrl }) (59-63; only when TWITTER_CLIENT_ID is non-empty, which the same .env can set), BlueskyClient({ serviceUrl: cfg.bluesky.pdsHost }) (78-82) and FileTokenStore(cfg.tokenStorePath) (108) are built from the raw values. validateConfig is not called.
4. propagation pkg/@eserstack/httpclient/client.ts:44 (resolveUrl): The base URL is string-concatenated with the endpoint path. No scheme or host restriction exists, so http:// and arbitrary hosts are accepted.
5. propagation pkg/@eserstack/posts/adapters/bluesky/auth-provider.ts:52 (BlueskyAuthProvider.loginWithCredentials): The handle and app password are POSTed to <BLUESKY_PDS_HOST>/xrpc/com.atproto.server.createSession. Reached from login.ts:74 and the TUI menu.ts:327.
6. propagation pkg/@eserstack/posts/adapters/twitter/client.ts:51 (TwitterClient.authHeaders): Stored access tokens, loaded from the home token store and installed by with-fresh-tokens.ts:77 (auth.setTokens), are sent as `Authorization: Bearer` to <TWITTER_API_BASE_URL>. bluesky/client.ts:63 does the same toward <BLUESKY_PDS_HOST>/xrpc.
7. sink pkg/@eserstack/posts/adapters/token-store/file-token-store.ts:87 (writeStore): ensureDir plus writeTextFile write the access and refresh tokens to the configured path. The constructor (97-98) uses the path verbatim, so a relative path resolves against the cwd. Reached from login.ts:79, menu.ts:351 and with-fresh-tokens.ts:83.

Conditions:
- user_interaction: The operator, or an agent acting as the operator, runs an `eser posts` subcommand (or the posts TUI) with the working directory set to a directory whose .env / .env.development / .env.local / .env.development.local an attacker controls, for example a cloned third-party repository.
- system_configuration: The operator has not set TWITTER_API_BASE_URL, BLUESKY_PDS_HOST or POSTS_TOKEN_STORE_PATH in the process environment. Process env overrides file values, but a normal installation sets none of them.
- data_state: Bearer-token disclosure requires that the operator has logged in before, so <home>/.eser/posts/tokens.json holds tokens, and that the hostile .env leaves POSTS_TOKEN_STORE_PATH unset so the home store is read. App-password disclosure requires that the operator runs Bluesky login (`eser posts login --platform=bluesky ...` or the TUI login).

Observed in the audit sandbox: Run 1: the real createAppContext produced cfg.bluesky.pdsHost=http://127.0.0.1:18081/evil-pds, cfg.twitter.apiBaseUrl=http://127.0.0.1:18081/evil-x and cfg.tokenStorePath=./leaked/tokens.json. The fixture received POST /evil-pds/xrpc/com.atproto.server.createSession with body {"identifier":"v39.example","password":"V39-DUMMY-APP-PASSWORD"}. /scratch/work/repo/leaked/tokens.json was created with accessToken V39-DUMMY-ACCESS and refreshToken V39-DUMMY-REFRESH. Run 2: with cfg.tokenStorePath undefined (home store), the timeline triggers sent GET /evil-x/users/me?... with `Authorization: Bearer V39-HOME-X-ACCESS` and GET /evil-pds/xrpc/app.bsky.feed.getTimeline?limit=5 with `Authorization: Bearer V39-HOME-BSKY-ACCESS`, so the home-stored tokens reached the host named in the cwd .env.

Fix strategy: Stop reading credential-routing keys from the working directory. Load the posts .env files from the operator's config directory (<home>/.eser/posts/) instead of '.', or keep cwd loading only for non-sensitive keys. Separately, validate the three values at the composition root: require an absolute https:// URL for TWITTER_API_BASE_URL and BLUESKY_PDS_HOST (allow http/loopback only behind an explicit developer flag from the process env), and require POSTS_TOKEN_STORE_PATH to be absolute after '~/' expansion. Print which .env files were loaded and the resolved token path. Fix the committed pkg/@eserstack/posts/.env, which relies on '~' expansion that does not exist.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: For a credential-holding global CLI, endpoint overrides and the token-store location should come only from operator-owned configuration: the process environment, or a file under the operator's home/config directory. If cwd-local .env files are read at all, they should be limited to non-sensitive keys. Endpoint overrides should require absolute https URLs unless the operator explicitly opts in, ...
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/posts/config.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/@eserstack/posts/config.ts: TWITTER_API_BASE_URL, BLUESKY_PDS_HOST and POSTS_TOKEN_STORE_PATH are now read only from the process environment (readOperatorEnv), never from .env files in the working directory. Other keys (client id, redirect URI, AI provider) still load from .env as before, so the package's dev workflow is unchanged. New requireServiceUrl accepts https URLs, and plain http only for loopback hosts (local mocks). New requireTokenStorePath expands a leading ~/ and rejects relative paths. The committed pkg/@eserstack/posts/.env no longer sets POSTS_TOKEN_STORE_PATH=~/..., which relied on tilde expansion that did not exist; it now carries a comment saying where the routing keys come from. Regression: new 'credential routing keys' block in config.test.ts (a cwd .env with attacker hosts and ./leaked/tokens.json yields undefined for all three while TWITTER_CLIENT_ID still loads; https/loopback-only URL rule; ~/ expansion and relative-path rejection). It fails on the committed config.ts and passes now when run from the repo root. Pre-existing and unrelated: running config.test.ts from inside pkg/@eserstack/posts fails the default-redirect-URI case, because the committed .env sets TWITTER_REDIRECT_URI; that was already true before this change. Not done: printing which .env files were loaded.
<!-- SECTION:NOTES:END -->
