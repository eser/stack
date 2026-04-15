# TODOS

## Security

- [ ] Git guard: switch from blocklist to allowlist approach — only allow
      known-safe git commands (log, diff, status, show, blame, stash list, tag
      -l, branch --list) instead of blocking known-dangerous ones
- [ ] Git guard: detect bash -c / sh -c subshell bypass — commands like
      `bash -c 'git stash drop'` currently evade the guard

## Architecture

- [ ] invoke-hook.ts: extract decision logic into pure functions for unit
      testability — currently reads from stdin and is monolithic
- [ ] Concern sections: make fully context-aware beyond classification flags —
      consider semantic relevance per concern per spec type
- [ ] SessionStart hook: Claude Code has a known bug where startup hooks execute
      but output is not injected into context for new sessions (works for
      /clear, /compact, resume). Monitor upstream fix.

## Future Features

- [ ] Plan-to-spec conversion: noskills spec new --from-plan plan.md
- [ ] Adaptive discovery: non-adaptive questions batched, adaptive follow-ups
      one-by-one
- [ ] Custom concerns beyond built-in 6
- [ ] Agent B cross-model validation via Agent Bridge
- [ ] Kiro native spec adapter
- [ ] Selective undo/restore from purge history
