// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Sync engine — regenerates tool-specific instruction files from .eser/rules/.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as claude from "./claude.ts";
import * as cursor from "./cursor.ts";
import * as kiro from "./kiro.ts";
import * as copilot from "./copilot.ts";
import * as windsurf from "./windsurf.ts";
import * as hooks from "./hooks.ts";
import { setCommandPrefix } from "../output/cmd.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Rule Loading
// =============================================================================

export const loadRules = async (root: string): Promise<readonly string[]> => {
  const rulesDir = `${root}/${persistence.paths.rulesDir}`;
  const rules: string[] = [];

  try {
    for await (const entry of runtime.fs.readDir(rulesDir)) {
      if (
        entry.isFile &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))
      ) {
        const content = await runtime.fs.readTextFile(
          `${rulesDir}/${entry.name}`,
        );
        // Use first line as the rule summary for bullet rendering
        const firstLine = content.trim().split("\n")[0] ?? content.trim();
        rules.push(firstLine);
      }
    }
  } catch {
    // No rules yet
  }

  return rules;
};

// =============================================================================
// Sync
// =============================================================================

// Claude Code is handled separately (needs SyncOptions for allowGit)
const GENERATORS: Readonly<
  Partial<
    Record<
      schema.CodingToolId,
      (
        root: string,
        rules: readonly string[],
        commandPrefix: string,
      ) => Promise<void>
    >
  >
> = {
  cursor: cursor.sync,
  kiro: kiro.sync,
  copilot: copilot.sync,
  windsurf: windsurf.sync,
};

export const syncAll = async (
  root: string,
  tools: readonly schema.CodingToolId[],
  config?: schema.NosManifest | null,
): Promise<readonly string[]> => {
  const rules = await loadRules(root);
  const synced: string[] = [];
  const syncOptions = { allowGit: config?.allowGit ?? false };
  const commandPrefix = config?.command ?? "npx eser@latest noskills";
  setCommandPrefix(commandPrefix);

  for (const toolId of tools) {
    if (toolId === "claude-code") {
      // Claude gets options (allowGit affects CLAUDE.md content)
      await claude.sync(root, rules, syncOptions, commandPrefix);
      synced.push(toolId);
      continue;
    }

    const generator = GENERATORS[toolId];

    if (generator !== undefined) {
      await generator(root, rules, commandPrefix);
      synced.push(toolId);
    }
  }

  // Generate all Claude Code hooks (enforce, stop-snapshot, post-write, post-bash)
  if (tools.includes("claude-code")) {
    await hooks.syncHooks(root, commandPrefix);
    await generateAgentFile(root, commandPrefix);
    await generateVerifierFile(root, commandPrefix);
    synced.push("hooks");
  }

  return synced;
};

// =============================================================================
// Agent File Generation
// =============================================================================

const generateAgentFile = async (
  root: string,
  commandPrefix: string,
): Promise<void> => {
  const agentDir = `${root}/.claude/agents`;
  await runtime.fs.mkdir(agentDir, { recursive: true });

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

  await runtime.fs.writeTextFile(`${agentDir}/noskills-executor.md`, content);
};

const generateVerifierFile = async (
  root: string,
  _commandPrefix: string,
): Promise<void> => {
  const agentDir = `${root}/.claude/agents`;
  await runtime.fs.mkdir(agentDir, { recursive: true });

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

  await runtime.fs.writeTextFile(`${agentDir}/noskills-verifier.md`, content);
};
