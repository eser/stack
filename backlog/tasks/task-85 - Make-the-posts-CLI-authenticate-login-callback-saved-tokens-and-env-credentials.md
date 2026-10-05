---
id: TASK-85
title: >-
  Make the posts CLI authenticate: login-callback, saved tokens and env
  credentials
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - posts
  - bug
  - security
dependencies: []
references:
  - pkg/@eserstack/posts/adapters/cli/commands/login.ts
  - pkg/@eserstack/posts/adapters/cli/wiring.ts
  - pkg/@eserstack/posts/module.ts
  - pkg/@eserstack/posts/application/handlers.ts
  - pkg/@eserstack/posts/config.ts
  - pkg/@eserstack/posts/README.md
priority: high
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
For Twitter/X, `eser posts login` prints `eser posts login-callback ...` (adapters/cli/commands/login.ts:54), but module.ts registers no such command, so the login cannot be completed from the CLI. compose, translate, thread, timeline and usage call withFreshTokens only when --platform is given (application/handlers.ts:139-143), and createAppContext in adapters/cli/wiring.ts:108-110 never installs saved tokens, so these commands run unauthenticated and `eser posts status` always reports 'not authenticated'. `--password=` (login.ts:4-7, :61-72) puts the Bluesky app password in shell history and the process list, while config.ts:170 already reads BLUESKY_APP_PASSWORD. Rule: security-practices: Secrets Come From the Environment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `eser posts login-callback` exists and saves the exchanged tokens, or the login message points at the terminal menu
- [x] #2 CLI commands without --platform use the saved tokens, as TuiMenu.restoreSavedTokens does
- [x] #3 Bluesky credentials come from config or the environment, or a prompt; --password is removed or deprecated
- [x] #4 TWITTER_CLIENT_SECRET and AI_PROVIDER are either wired or removed from config
- [x] #5 The README Command Line section matches, with tests for each path; deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

posts: Checked independently.
- AC#1 is met by the terminal-menu alternative: `eser posts login --platform=twitter` runs the shared runBrowserLogin flow (adapters/tui/browser-login.ts) and saves the tokens. That flow waits for the loopback redirect, falls back to a pasted URL, checks the state and exchanges the code. No login-callback command exists anywhere now.
- AC#2: in handlers.ts, onPlatform sends compose, translate, thread, timeline and usage through withFreshTokens for the first platform in ctx.auths, and wiring.ts puts tokenStore and auths in PostsCtx. Search without --platform and the unified timeline also go through withFreshTokens for each platform. status uses restoreSavedTokens, which is shared with TuiMenu.
- AC#3: Bluesky credentials come from BLUESKY_IDENTIFIER (or --handle) and BLUESKY_APP_PASSWORD. --password is rejected, and unknown flags are rejected without echoing their values.
- AC#4: TWITTER_CLIENT_SECRET is wired as Basic client auth on token requests and kept in a #private field. AI_PROVIDER and config.ai.provider are removed, and no reference remains in the repository source.
- AC#5: the README Command Line table and login text match each command's flags and usage strings. login, browser-login, handlers, restore-saved-tokens, status, auth-provider, config, with-fresh-tokens and file-token-store all have tests.
- Verifier fix: the package `test` task granted too few permissions for the new tests, and the default-redirect test depended on the working directory. Both are fixed.
<!-- SECTION:NOTES:END -->
