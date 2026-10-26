---
id: TASK-19
title: 'Make the git guard decide on the parsed command, not the literal Bash text'
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
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: low (likelihood high, impact low). Fingerprint: noskills/invoke-hook/git-guard-literal-substring-precheck. Full record, bounded reproduction and proposed code are in security-report.md.

checkGitGuard returns early when the flag-stripped command does not contain the case-sensitive substring `git` (invoke-hook.ts:137), and the predicates it guards compare the first whitespace token of each segment against `git` without shell-quote handling (git.ts:155-156) while the bypass detector models only *sh -c, eval, pipe segments and $()/backtick fragments (git.ts:216-253). A Bash tool call that reaches git any other way is never denied. Independently reproduced against the unmodified guard module in the sandbox: `g''it push origin main`, `printf 'g%sit push origin main' '' > r.sh; sh r.sh`, `bash run.sh`, `GIT=$(which g?t); $GIT push`, `python3 -c "import subprocess;subprocess.run(['g'+'it','push'])"`, `GIT push origin main`, and also `"git" push origin main`, `'git' push origin main`, `sh <<< 'git push origin main'` and `echo 'git push origin main' | sh` (the last four contain the literal `git` and still pass) all produce no `permissionDecision: deny`, while `git push origin main`, `git commit -m x`, `bash -c "git push"` and `\git push origin main` are denied. The precheck is a defect in its own right, not only an inherent classifier limit: `GIT push origin main`, `Git commit -m x` and `/usr/bin/GIT push` are denied by the predicates (hasGitWrite=true, because isGitProgram lowercases the basename at git.ts:140) but allowed by the hook, because the case-sensitive `includes("git")` returns first. The design does not present the guard as best-effort: README.md:160-163 calls hooks the difference between "please don't" and "you can't", README.md:403-406 says read-only git is enforced by the PreToolUse hook, and the fallback comment at invoke-hook.ts:148-149 shows smuggled writes are meant to be denied. The repo's own CLI runs `git commit`/`git push` (codebase/release.ts:181-193, codebase/git.ts:275-347), so an agent invoking a task runner crosses the guard without any adversarial spelling. Attacker: a model turn, or repository content injected into the model's context. Affected principal: the operator. Execution identity: the operator's user with the operator's git credentials. Resource: the local repository history and its remotes. Action: a git write the manifest (allowGit=false) says the agent may not perform. The vendor's Bash permission is the remaining outer layer; with an approval, an `--allowedTools` Bash rule (ai/adapters/claude-code.ts:269-273) or a permissive mode, this hook is the only deterministic control.

Root cause: pkg/@eserstack/noskills/commands/invoke-hook.ts:137 (`if (!commandToScan.includes("git")) return null;`) returns before the predicates run, and the predicates themselves classify text rather than the program that will execute: git.ts:155-156 splits each segment on whitespace and compares the raw first token to `git`/`git.exe` (a quoted or quote-split program name never matches), git.ts:195 skips phrases without the literal `git`, and containsGitWriteBypass (git.ts:216-253) enumerates only *sh -c, eval, pipe segments and $()/backtick fragments, so scripts read from stdin or files, task runners and interpreters are never modelled. The sibling candidate agents/guards/git/config-scope-flags-allowlisted is a different root cause (an allowlist-data error at git.ts:69-71 inside isGitAllowed, where the classifier sees the command and misjudges it); it is co-located in the same guard but has a separate mechanism and fix.

Intended behaviour: The hook denies any Bash tool call whose execution performs a git write, however the git binary is spelled or reached (README.md:384-385: git write operations are the CLI's responsibility, never the agent's; README.md:403-406: enforced by the PreToolUse hook; synced CLAUDE.md at sync/claude.ts:61: no write commands).

Trace:
1. entrypoint pkg/@eserstack/noskills/commands/invoke-hook.ts:162 (handlePreToolUse): Hook JSON read from stdin; tool_input.command is model-chosen Bash text, an untrusted input under the AI domain rules.
2. propagation pkg/@eserstack/noskills/commands/invoke-hook.ts:288 (handlePreToolUse git write guard): checkGitGuard(command, allowGit) with allowGit=false by default (line 286).
3. propagation pkg/@eserstack/noskills/commands/invoke-hook.ts:137 (checkGitGuard): Returns null (allow) when the stripped text lacks the case-sensitive substring `git`; `g''it`, `GIT`, `Git`, `g?t`, script files, task runners and interpreter strings never reach the predicates, including case variants the predicates would have denied.
4. propagation pkg/@eserstack/agents/guards/git.ts:156 (isGitAllowed): First whitespace token compared to `git`/`git.exe` with no shell-quote handling; `"git"`, `'git'` and `g''it` are treated as non-git programs and allowed.
5. propagation pkg/@eserstack/agents/guards/git.ts:216 (containsGitWriteBypass): Fallback recognises only *sh -c, eval, `|` segments and $()/backtick fragments; `sh <<< '...'`, `echo '...' | sh`, `sh r.sh`, `bash run.sh` and interpreters are not modelled.
6. sink pkg/@eserstack/noskills/commands/invoke-hook.ts:295 (handlePreToolUse): Returns ok with no deny written; the vendor executes the command, which runs git push/commit as the operator.

Conditions:
- system_configuration: noskills hooks synced into .claude/settings.json (sync/hooks.ts) and manifest allowGit false, the default (invoke-hook.ts:286).
- user_interaction: The vendor CLI must permit the Bash call: an approval, an `--allowedTools` Bash rule passed by the adapter (ai/adapters/claude-code.ts:269-273), or a permissive mode. With a broad allow rule this hook is the only deterministic layer.
- environmental_dependency: The `GIT push` / `Git commit` variants need a case-insensitive filesystem; verified on the audited host that `command -v GIT` resolves to /usr/bin/GIT on APFS. The quoting, stdin-script, script-file, task-runner and interpreter shapes are shell-portable.
- data_state: The script-file and task-runner shapes need a script or CLI on disk that performs the git write; the agent may write scripts during EXECUTING under the file-edit gate, and the repo's own `eser codebase release` path already does.

Observed in the audit sandbox: Controls: DENY:write, DENY:write, DENY:bypass, DENY:write, ALLOW. All eleven payloads: ALLOW(no deny emitted). hasGitWrite("g''it push origin main")=false; hasGitWrite('"git" push origin main')=false. Differential: `GIT push origin main`, `Git commit -m x`, `/usr/bin/GIT push` each hook=ALLOW(precheck) with hasGitWrite=true and isGitAllowed=false, while `git push origin main` is hook=DENY:write. node v26.7.0, both runs exit 0; outputs retained as v26-guard-check.txt and v26-precheck-diff.txt.

Fix strategy: Stop treating the text guard as the enforcement point and say so in the README and synced CLAUDE.md. Immediate source fixes that are cheap and close the demonstrated classes: remove the `includes("git")` short-circuit so the predicates see every command (this alone closes the case-variant class, which the predicates already handle); normalise shell quoting before tokenising (strip empty `''`/`""` pairs, unwrap a quoted program token) so `g''it`, `"git"` and `'git'` resolve to git; treat any command that feeds a shell from stdin or a file (`sh <<<`, `| sh`, `sh file`, `bash file`) as a git write when the guard is active, because its content cannot be inspected. Script files, task runners and interpreters cannot be decided from text, so add an execution-level control for agent sessions: a `git` wrapper placed first on PATH (or GIT_CONFIG-driven `core.hooksPath` pre-push/pre-commit hooks) that refuses write subcommands unless allowGit is set, plus remote branch protection. Add regression tests for every shape in the payload list.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The invariant holds in code: The hook denies any Bash tool call whose execution performs a git write, however the git binary is spelled or reached (README.md:384-385: git write operations are the CLI's responsibility, never the agent's; README.md:403-406: enforced by the PreToolUse hook; synced CLAUDE.md at sync/claude.ts:61: no write commands).
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/noskills/commands/invoke-hook.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Source fixes for every demonstrated shape. pkg/@eserstack/agents/guards/git.ts: program tokens are de-quoted and backslash-unescaped before comparison (g''it, "git", 'git', \\git). Leading NAME=value assignments and wrapper words (env, command, exec, sudo, nohup, time, nice, builtin, plus their flags) are skipped to find the real program. A program taken from a bare variable ($GIT push, ${G} push) counts as a git write, because the text cannot tell. extractGitInvocations and containsGitWriteBypass match git case-insensitively. A shell fed from stdin or a heredoc (| sh, sh <<< ..., sh << EOF) has the whole command re-scanned with quoting removed. New exported helpers: feedsShellFromStdin, shellScriptTargets and writesFile. pkg/@eserstack/noskills/commands/invoke-hook.ts: removed the case-sensitive includes('git') pre-checks (both call sites). checkGitGuard is async, exported as the testable core, and also inspects shell scripts the command runs. A script written by the same command is denied; an existing script up to 256 KiB is read and scanned, and a larger one is denied; a missing one is left to the shell. README 'Git is read-only' now states what the hook covers, that it cannot decide programs an interpreter builds at run time (python -c 'g'+'it'), and that remote branch protection plus no push credentials is the hard guarantee. Regression: agents/guards/git-bypass.test.ts (16 bypass shapes denied, 9 benign commands allowed, helper cases) and noskills/commands/git-guard-hook.test.ts (hook-level shapes, script inspection, same-command script, allowGit). Five of the seven sampled shapes pass the committed hasGitWrite, GIT push is also skipped by the old pre-check, and the new tests fail on the committed code. All 327 agents and noskills tests pass. AC #1 (full invariant for any execution path) is not met by design: interpreter-computed programs stay undecidable from text; an execution-level control (a git wrapper first on PATH or core.hooksPath hooks for agent sessions) would be a separate feature.

Acceptance criterion #1 stays unchecked on purpose: the interpreter-computed case cannot be decided from command text. It is tracked as task-22 with its own acceptance criteria.
<!-- SECTION:NOTES:END -->
