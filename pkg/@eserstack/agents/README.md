# 🤖 [@eserstack/agents](./)

`@eserstack/agents` finds interactive coding agents (Claude Code, OpenCode,
Codex) on `PATH` and builds the spec to launch one in a terminal pane. It also
holds the read-only git guard: pure predicates that decide whether a shell
command only reads git state or writes to the repository, including writes
hidden in subshells, pipes and scripts. `@eserstack/mux` owns the panes and
PTYs, and noskills uses the guard in its PreToolUse hook.

The package does not read an agent's state from its terminal output. An agent
reports its state itself through ACP `session/update` events.

## Quick Start

Look up an adapter and build the spawn spec for it:

```typescript
import * as agents from "@eserstack/agents";

const adapter = agents.getAgentAdapter("claude-code") ??
  agents.defaultAgentAdapter();
const spec = await adapter.buildSpawnSpec({
  cwd: "your_project_dir",
  cols: 120,
  rows: 40,
});

if (spec === null) {
  console.log(`${adapter.displayName} is not installed`);
} else {
  console.log(spec.command, spec.args); // "claude" []
}
```

`buildSpawnSpec` returns `null` when none of the adapter's binaries is on
`PATH`.

## Adapters

An `AgentAdapter` has an `id`, a `displayName`, `capabilities`, and two
functions:

- `resolveCommand()` returns the first binary found on `PATH`, or `null`.
- `buildSpawnSpec(ctx)` returns `{ command, args, env, cwd }`, or `null` when
  the binary is missing. `env` merges `ctx.baseEnv` and `ctx.extraEnv`, with
  `extraEnv` winning.

A found binary is cached for the adapter's lifetime. A miss is not cached, so a
long-running process picks up an agent installed after the first lookup.

| Adapter                    | `id`          | Binaries tried          |
| -------------------------- | ------------- | ----------------------- |
| `agents.claudeCodeAdapter` | `claude-code` | `claude`, `claude-code` |
| `agents.opencodeAdapter`   | `opencode`    | `opencode`              |
| `agents.codexAdapter`      | `codex`       | `codex`                 |

The registry lists them in that order:

```typescript
import * as agents from "@eserstack/agents";

agents.listAgentAdapters().map((a) => a.id); // ["claude-code", "opencode", "codex"]
agents.getAgentAdapter("codex"); // the Codex adapter, or undefined for an unknown id
agents.defaultAgentAdapter(); // the Claude Code adapter
```

### Your own adapter

`createCliAgentAdapter` builds an adapter for any CLI agent from its binary
names, tried in order:

```typescript
import * as agents from "@eserstack/agents";

const aider = agents.createCliAgentAdapter({
  id: "aider",
  displayName: "Aider",
  candidates: ["aider"],
  capabilities: { supportsBracketedPaste: false },
});

const command = await aider.resolveCommand(); // "aider", or null
```

`capabilities.supportsBracketedPaste` defaults to `true`.

### Binary discovery

```typescript
import * as agents from "@eserstack/agents";

await agents.isOnPath("git"); // true when `which git` (`where` on Windows) succeeds
await agents.resolveFirstOnPath(["claude", "claude-code"]); // first hit, or null
```

## Git Guard

`agents.gitGuard` decides whether a shell command only reads git state. Every
function is pure: it inspects the command text and does no I/O.

```typescript
import * as agents from "@eserstack/agents";

agents.gitGuard.isGitAllowed("git log --oneline"); // true
agents.gitGuard.isGitAllowed("git push origin main"); // false
agents.gitGuard.isGitAllowed("ls -la"); // true: the guard only governs git

agents.gitGuard.hasGitWrite("bash -c 'git push origin main'"); // true
agents.gitGuard.extractGitInvocations("git status && git commit -m wip");
// ["git status", "git commit -m wip"]
```

| Function                          | What it answers                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `isGitAllowed(command)`           | Is this single command segment a read-only git command (or not git at all)?      |
| `isGitReadOnly(command)`          | Alias of `isGitAllowed`, kept for older callers                                  |
| `extractGitInvocations(command)`  | Every `git ...` fragment in chains, multi-line scripts, `$(...)` and backticks   |
| `containsGitWriteBypass(command)` | Does a subshell, `eval`, pipe or command substitution carry a git write?         |
| `hasGitWrite(command)`            | Does the command perform or smuggle any git write?                               |
| `feedsShellFromStdin(command)`    | Does a shell in the command read its script from stdin or a heredoc?             |
| `shellScriptTargets(command)`     | Which script files the command runs (`sh run.sh`, `source x.sh`)                 |
| `writesFile(command, path)`       | Does the command itself write `path` (`> path`, `>> path`, `tee path`)?          |
| `stripFlagValues(command)`        | The command with quoted flag values removed, so `--answer="use git"` is not read |

The guard classifies text. It cannot tell what a program assembles at run time,
for example `python -c` building `git push` from parts, so treat it as one layer
of a read-only policy rather than the whole of it.

A wrapper that sits in front of the git binary sees the actual arguments
instead. These functions decide on that argument vector, without the program
name:

```typescript
import * as agents from "@eserstack/agents";

agents.gitGuard.isGitArgsAllowed(["-C", "/repo", "log"]); // true
agents.gitGuard.isGitArgsAllowed(["commit", "-m", "wip"]); // false
agents.gitGuard.isGitRemoteWrite(["push", "origin", "main"]); // true
agents.gitGuard.splitGitArgs(["-C", "/repo", "commit", "-m", "wip"]);
// { globalOptions: ["-C", "/repo"], subcommand: "commit", subcommandArgs: ["-m", "wip"] }
```

| Function                 | What it answers                                                       |
| ------------------------ | --------------------------------------------------------------------- |
| `isGitArgsAllowed(args)` | Does git, run with these arguments, only read repository state?       |
| `isGitRemoteWrite(args)` | Does it send commits to another repository (`push`, `send-pack`)?     |
| `splitGitArgs(args)`     | The global options before the subcommand, the subcommand and its args |

The allowlists behind them are exported too (`GIT_ALLOWED_SUBCOMMANDS`,
`GIT_CONDITIONAL_READS`, the global option sets, `GIT_INFO_OPTIONS` and
`GIT_REMOTE_WRITE_SUBCOMMANDS`), so a wrapper script generated from them stays
in step with the guard. noskills builds its agent-session git wrapper this way.

## 🔗 Links

- [`@eserstack/noskills`](https://github.com/eser/stack/tree/main/pkg/@eserstack/noskills):
  the orchestrator whose hooks use the git guard and whose manager launches
  agents through these adapters
- [JSR package](https://jsr.io/@eserstack/agents): the API reference generated
  from source
- [eser/stack on GitHub](https://github.com/eser/stack)
