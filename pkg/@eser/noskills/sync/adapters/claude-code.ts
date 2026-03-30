// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Claude Code adapter — implements ToolAdapter for Claude Code, delegating to
 * the existing claude.ts, hooks.ts modules and agent-file generation logic.
 *
 * @module
 */

import type * as adapter from "../adapter.ts";
import * as claude from "../claude.ts";
import * as hooks from "../hooks.ts";
import * as crossRuntime from "@eser/standards/cross-runtime";

// =============================================================================
// Agent File Generation (moved from engine.ts)
// =============================================================================

const generateAgentFile = async (
  root: string,
  commandPrefix: string,
): Promise<void> => {
  const agentDir = `${root}/.claude/agents`;
  await crossRuntime.runtime.fs.mkdir(agentDir, { recursive: true });

  const content = `---
name: noskills-executor
description: "Executes a single noskills task."
tools: Read, Edit, MultiEdit, Write, Bash, Grep, Glob, LS
---

You are executing a single task from a noskills spec.
Your ONLY job is to complete the task described in the prompt.
Follow all behavioral rules provided in the prompt.
Do NOT start new tasks, explore unrelated code, or make architectural decisions.
If the task is too vague to execute, say so immediately.

## Self-Verification
After completing the task, you MUST verify your own work before reporting:
1. Run type check: \`deno check\` on all modified files
2. Run test suite: \`deno test\` on the relevant test files
3. If type check or tests fail, fix the issues before reporting

## Reporting
When finished, provide a structured JSON summary:
\\\`\\\`\\\`json
{"completed": ["<item IDs done>"], "remaining": ["<item IDs not done>"], "blocked": ["<item IDs needing decisions>"], "filesModified": ["<paths>"], "verification": {"typeCheck": "pass|fail", "tests": "pass|fail (N passed, M failed)"}}
\\\`\\\`\\\`

Do NOT return raw test output — summarize it in the verification field.
The orchestrator will submit this to \`${commandPrefix} next --answer\` on your behalf.
`;

  await crossRuntime.runtime.fs.writeTextFile(
    `${agentDir}/noskills-executor.md`,
    content,
  );
};

const generateVerifierFile = async (
  root: string,
  _commandPrefix: string,
): Promise<void> => {
  const agentDir = `${root}/.claude/agents`;
  await crossRuntime.runtime.fs.mkdir(agentDir, { recursive: true });

  const content = `---
name: noskills-verifier
description: "Independently verifies completed task work. Read-only. Never sees the executor's context."
tools: Read, Bash, Grep, Glob, LS
---

You are verifying another agent's work. You have NO context about how it was done.
Read the changed files. Run the test suite. Check each acceptance criterion independently.

For each acceptance criterion:
- PASS: with evidence — show the grep result, the test output, or the file content that proves it
- FAIL: with specific reason — what's missing, what's wrong, what doesn't match

Be skeptical. Don't assume anything works — verify it yourself.
You CANNOT edit files. Read-only access only.

## Verification Steps
1. Read each modified file and verify the changes are correct
2. Run type check: \\\`deno check\\\` on modified files
3. Run tests: \\\`deno test\\\` on relevant test files
4. Check each acceptance criterion against actual file contents

## Report Format
When finished, provide a structured JSON summary:
\\\`\\\`\\\`json
{"results": [{"id": "ac-1", "status": "PASS", "evidence": "..."}, {"id": "ac-2", "status": "FAIL", "reason": "..."}]}
\\\`\\\`\\\`

The orchestrator will use this report for the noskills status report.
`;

  await crossRuntime.runtime.fs.writeTextFile(
    `${agentDir}/noskills-verifier.md`,
    content,
  );
};

// =============================================================================
// Adapter
// =============================================================================

export const claudeCodeAdapter: adapter.ToolAdapter = {
  id: "claude-code",

  capabilities: {
    rules: true,
    hooks: true,
    agents: true,
    specs: false,
    mcp: false,
    interaction: {
      hasAskUserTool: true,
      optionPresentation: "tool",
      hasSubAgentDelegation: true,
      subAgentMethod: "task",
    },
  },

  async syncRules(
    ctx: adapter.SyncContext,
    options?: adapter.SyncOptions,
  ): Promise<void> {
    await claude.sync(ctx.root, ctx.rules, options, ctx.commandPrefix);
  },

  async syncHooks(
    ctx: adapter.SyncContext,
    _options?: adapter.SyncOptions,
  ): Promise<void> {
    await hooks.syncHooks(ctx.root, ctx.commandPrefix);
  },

  async syncAgents(
    ctx: adapter.SyncContext,
    _options?: adapter.SyncOptions,
  ): Promise<void> {
    await generateAgentFile(ctx.root, ctx.commandPrefix);
    await generateVerifierFile(ctx.root, ctx.commandPrefix);
  },
};
