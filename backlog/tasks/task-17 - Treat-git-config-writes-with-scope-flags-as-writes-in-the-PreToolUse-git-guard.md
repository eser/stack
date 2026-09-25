---
id: TASK-17
title: Treat git config writes with scope flags as writes in the PreToolUse git guard
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - noskills
dependencies: []
references:
  - pkg/@eserstack/noskills/commands/invoke-hook.ts
  - pkg/@eserstack/agents/guards/git.ts
  - security-report.md
priority: low
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: low (likelihood low, impact low). Fingerprint: agents/guards/git/config-scope-flags-allowlisted. Full record, bounded reproduction and proposed code are in security-report.md.

The noskills PreToolUse hook is the mechanical layer of the documented rule that git is read-only for agents (README: git write operations are the CLI's responsibility, never the agent's; enforced by behavioral rules, AGENTS.md and the PreToolUse hook). Its `git config` allowlist accepts the invocation whenever the token right after `config` is `--get`, `--get-all`, `--get-regexp`, `--list`, `-l`, `--global`, `--local` or `--system`. The last three are scope selectors, not read actions, so `git config --local core.hooksPath .githooks`, `git config --global user.email ...`, `git config --local remote.origin.url ...`, `git config --global credential.helper ...`, `git config --system core.sshCommand ...`, `git config --local --add ...` and `git config --global --unset ...` all return isGitAllowed=true, checkGitGuard returns null, and the hook exits without a `permissionDecision: deny`. `git config user.email x` without a scope flag is denied, so the gap is specific to the scope-flag spelling. Boundary assessment: the hook protects the operator (execution identity: the operator's account running the vendor CLI) from the agent turn, whose command text is model output that repository content can steer. It is a deterministic check and counts as a control, but it is not a containment boundary: it only filters git CLI spellings, it allows every non-git Bash command (invoke-hook.ts:294-295), and nothing in the target prevents the agent from editing `.git/config`, `.git/hooks/*` or `~/.gitconfig` directly with Write/Edit or `sed`. The vendor's own Bash permission is the outer layer; `noskills run` passes no permission flags (run.ts:280-289), so an operator who runs the unattended loop must pre-allow Bash in vendor settings, and in that configuration the hook is the only deterministic git control the product provides. The defect therefore breaks the guard's stated contract for scope-flagged config writes without granting the agent authority it did not already hold through the same hook.

Root cause: pkg/@eserstack/agents/guards/git.ts:61-73 lists the scope flags `--global` (69), `--local` (70) and `--system` (71) in the GIT_CONDITIONAL_READS entry for `config`; isGitAllowed (git.ts:165-171) inspects only the single token following the subcommand, so any `--local|--global|--system <key> <value>` (or `--add`/`--unset` after the scope flag) is accepted as a read. hook-decisions.ts:34-41 re-exports these predicates and invoke-hook.ts:132-155 relies on them for the deny decision.

Intended behaviour: `git config` is allowed only for read actions (`--get`, `--get-all`, `--get-regexp`, `--list`/`-l`, optionally scoped); a scope flag alone never makes an invocation read-only, and any invocation carrying a key/value pair, `--add`, `--unset`, `--unset-all`, `--replace-all`, `--edit`/`-e`, `--rename-section` or `--remove-section` is denied with the git-write reason (invoke-hook.ts:144), consistent with README.md:384-385 and 403-406.

Trace:
1. entrypoint pkg/@eserstack/noskills/commands/invoke-hook.ts:162 (handlePreToolUse): Reads the Claude Code PreToolUse hook JSON from stdin; tool_input.command is the Bash text emitted by the model turn (lower-trust: model output, steerable by repository content).
2. propagation pkg/@eserstack/noskills/commands/invoke-hook.ts:288 (handlePreToolUse git write guard): For toolName Bash the trimmed command is passed to checkGitGuard with allowGit from the manifest (schema.ts:495 default false).
3. propagation pkg/@eserstack/noskills/commands/invoke-hook.ts:143 (checkGitGuard): Each invocation from extractGitInvocations is accepted unless isGitAllowed returns false; the containsGitWriteBypass fallback (line 150) reuses the same predicate.
4. propagation pkg/@eserstack/agents/guards/git.ts:167 (isGitAllowed): Subcommand `config` is found in GIT_CONDITIONAL_READS and only tokens[idx+1] is compared against the read set.
5. propagation pkg/@eserstack/agents/guards/git.ts:69 (GIT_CONDITIONAL_READS config set): `--global` (69), `--local` (70) and `--system` (71) are members of the read set, so a write invocation whose next token is a scope flag returns true.
6. sink pkg/@eserstack/noskills/commands/invoke-hook.ts:295 (handlePreToolUse): checkGitGuard returned null; the handler returns without writeDeny, so no permissionDecision is written and the vendor CLI proceeds to run the git config write as the operator (subject to the vendor's own Bash permission).

Conditions:
- system_configuration: noskills hooks synced into the project's .claude/settings.json (sync/hooks.ts:27-40, matcher Write|Edit|MultiEdit|Bash) and manifest allowGit left at its default false.
- user_interaction: The vendor CLI must permit the Bash tool call: an interactive approval, a permissions.allow rule such as Bash(git:*) or Bash(*), or a bypass mode. `noskills run` (claude --print) passes no permission flags, so unattended use requires the operator to have pre-allowed Bash, and the hook is then the product's only deterministic git control.
- data_state: The config write itself lands immediately in .git/config, ~/.gitconfig or the system gitconfig; downstream effects (hooksPath, credential.helper, core.sshCommand, remote.origin.url, user.*) surface on the operator's next git operation that consults the key.

Observed in the audit sandbox: Controls `git push origin main`, `git commit -m x` and `git config user.email a@b.c` print DENY:write; `git config --get user.email` and `git config --list` print ALLOW(no deny emitted). All eight scope-flagged payloads print ALLOW(no deny emitted). isGitAllowed("git config --local core.hooksPath .githooks") = true; hasGitWrite("git config --local core.hooksPath .githooks") = false. node v26.7.0, mismatches=0, process exit 0. Output retained as v25-guard-check.txt; the hunter's guard-check.txt shows the same result for its five A-cases.

Fix strategy: Decide `git config` by action, not by scope: treat the invocation as a read only when a read action flag is present and no mutating flag or key/value pair follows; remove the scope flags from the read set; add regression tests for every scope flag with a value and for the legitimate scoped reads.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: `git config` is allowed only for read actions (`--get`, `--get-all`, `--get-regexp`, `--list`/`-l`, optionally scoped); a scope flag alone never makes an invocation read-only, and any invocation carrying a key/value pair, `--add`, `--unset`, `--unset-all`, `--replace-all`, `--edit`/`-e`, `--rename-section` or `--remove-section` is denied with the git-write reason (invoke-hook.ts:144), consisten...
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/agents/guards/git.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/@eserstack/agents/guards/git.ts: git config is no longer decided by the single token after the subcommand. The config entry is gone from GIT_CONDITIONAL_READS, and a new isGitConfigRead parses every argument. It allows --get/--get-all/--get-regexp/--get-urlmatch/--get-color/--get-colorbool/--list/-l, the get and list subcommands, and a single-key query (git config user.name). Scope and display flags (--global, --local, --system, --worktree, --show-origin, --file X, --type X, ...) are neutral. Any other flag (--add, --unset*, --replace-all, --edit/-e, --rename-section, --remove-section, --comment), the set/unset subcommands, or a key followed by a value are denied. The subcommand is now located by index rather than tokens.indexOf, so a global flag value equal to the subcommand name can no longer shift the check. noskills re-exports these predicates (hook-decisions.ts), so the PreToolUse hook gets the fix without a change there. Regression: agents/guards/git-config.test.ts (12 reads allowed, 15 writes denied by isGitAllowed and hasGitWrite). Both tests fail on the committed guard, which also refused plain reads like 'git config user.name', and pass now. Existing git.test.ts and hook-decisions.test.ts still pass.
<!-- SECTION:NOTES:END -->
