# 🤖 [@eserstack/agents](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/agents` is published
> on npm under the same name (`pnpm add @eserstack/agents`); the JSR versions
> stay available but get no updates.

`@eserstack/agents` finds interactive coding agents (Claude Code, OpenCode,
Codex) on `PATH` and builds the spec to launch one in a terminal pane.
`@eserstack/mux` owns the panes and PTYs.

The package does not read an agent's state from its terminal output. An agent
reports its state itself through ACP `session/update` events.

## Quick Start

Look up an adapter and build the spawn spec for it:

```typescript
import * as agents from "@eserstack/agents";

const adapter =
  agents.getAgentAdapter("claude-code") ?? agents.defaultAgentAdapter();
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

## Upgrading from 5.0.0

The git guard (`agents.gitGuard` and the `./guards` export) is removed. Its
only user was the TypeScript noskills hook, which the Go noskills replaced
(TASK-262); the Go guard runs in `noskills invoke-hook pre-tool-use`. Code that
called it keeps its own copy of the predicates, or runs the hook:

```bash
# Before: agents.gitGuard.isGitAllowed("git push origin main") === false
# After: the hook answers with a deny decision on stdout
echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' |
  noskills invoke-hook pre-tool-use
```

## 🔗 Links

- [`@eserstack/noskills`](https://github.com/eser/stack/tree/main/pkg/@eserstack/noskills):
  the orchestrator whose hooks use the git guard and whose manager launches
  agents through these adapters
- [npm package](https://www.npmjs.com/package/@eserstack/agents)
- [eser/stack on GitHub](https://github.com/eser/stack)
