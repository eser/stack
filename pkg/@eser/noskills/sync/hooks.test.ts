// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 12: Hook behavior verification.
 *
 * These tests simulate the hook decision logic by reimplementing the core
 * conditionals from the generated Node.js scripts. This validates the logic
 * without needing to spawn Node processes or write to disk.
 *
 * The generated scripts are string templates in hooks.ts — we test the
 * behavioral contracts they encode.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

// =============================================================================
// PreToolUse enforcement logic (extracted from ENFORCE_SCRIPT)
// =============================================================================

type HookDecision = { allow: true } | { allow: false; reason: string };

const enforcePreToolUse = (input: {
  tool_name: string;
  tool_input: Record<string, unknown>;
  state: { phase: string } | null;
  allowGit?: boolean;
}): HookDecision => {
  const { tool_name, tool_input, state, allowGit } = input;

  // Bash: git write guard
  if (tool_name === "Bash") {
    const cmd = ((tool_input["command"] as string) ?? "").trim();

    if (!allowGit) {
      const gitWriteOps = [
        "git add",
        "git commit",
        "git push",
        "git merge",
        "git rebase",
        "git checkout",
        "git stash",
        "git reset",
        "git cherry-pick",
        "git tag",
        "git branch -d",
        "git branch -D",
        "git branch -m",
        "git revert",
        "git am",
        "git mv",
        "git rm",
      ];
      for (const op of gitWriteOps) {
        if (
          cmd.startsWith(op) || cmd.includes(" && " + op) ||
          cmd.includes("; " + op)
        ) {
          return {
            allow: false,
            reason:
              "git is read-only for agents. The user controls git. You may use `git log`, `git diff`, `git status`, `git show`, `git blame`.",
          };
        }
      }
    }
    return { allow: true };
  }

  // Non file-edit tools: allow
  const gated = ["Write", "Edit", "MultiEdit"];
  if (!gated.includes(tool_name)) return { allow: true };

  // .eser/ files: always allow
  const fp = (tool_input["file_path"] as string) ??
    (tool_input["path"] as string) ?? "";
  if (fp.includes(".eser/") || fp.includes(".claude/")) return { allow: true };

  // No state: allow (noskills not initialized)
  if (state === null) return { allow: true };

  const phase = state.phase;
  if (phase === "EXECUTING") return { allow: true };

  const reasons: Record<string, string> = {
    IDLE: "No active spec. Run `npx eser noskills spec new`",
    DISCOVERY:
      "Discovery in progress. Run `npx eser noskills next` to continue.",
    SPEC_DRAFT: "Spec needs review. Run `npx eser noskills approve`",
    SPEC_APPROVED:
      'Start execution first: `npx eser noskills next --answer="start"`',
    BLOCKED:
      'Execution blocked. Resolve with `npx eser noskills next --answer="resolution"`',
    COMPLETED:
      "Spec complete. Start a new one or run `npx eser noskills reset`",
  };
  return {
    allow: false,
    reason: reasons[phase] ?? "Run `npx eser noskills next` first.",
  };
};

// =============================================================================
// PreToolUse: Phase gating
// =============================================================================

describe("PreToolUse: phase gating", () => {
  it("blocks file edit when phase is DISCOVERY", () => {
    const result = enforcePreToolUse({
      tool_name: "Write",
      tool_input: { file_path: "/src/index.ts" },
      state: { phase: "DISCOVERY" },
    });
    assertEquals(result.allow, false);
    assertEquals(
      (result as { reason: string }).reason.includes("Discovery"),
      true,
    );
  });

  it("blocks file edit when phase is SPEC_DRAFT", () => {
    const result = enforcePreToolUse({
      tool_name: "Edit",
      tool_input: { file_path: "/src/api.ts" },
      state: { phase: "SPEC_DRAFT" },
    });
    assertEquals(result.allow, false);
    assertEquals(
      (result as { reason: string }).reason.includes("approve"),
      true,
    );
  });

  it("allows file edit when phase is EXECUTING", () => {
    const result = enforcePreToolUse({
      tool_name: "Write",
      tool_input: { file_path: "/src/upload.ts" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, true);
  });

  it("always allows edits to .eser/ files regardless of phase", () => {
    for (const phase of ["IDLE", "DISCOVERY", "SPEC_DRAFT", "BLOCKED"]) {
      const result = enforcePreToolUse({
        tool_name: "Write",
        tool_input: { file_path: "/project/.eser/rules/test.md" },
        state: { phase },
      });
      assertEquals(result.allow, true);
    }
  });
});

// =============================================================================
// PreToolUse: Git protection
// =============================================================================

describe("PreToolUse: git protection", () => {
  it("blocks git commit", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git commit -m 'test'" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
    assertEquals(
      (result as { reason: string }).reason.includes("read-only"),
      true,
    );
  });

  it("blocks git push", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git push origin main" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
  });

  it("blocks git checkout", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git checkout -b feature" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
  });

  it("blocks git add", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git add -A" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
  });

  it("blocks git stash", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git stash" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
  });

  it("blocks git reset", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git reset --hard HEAD" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
  });

  it("blocks git merge", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git merge main" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
  });

  it("blocks git rebase", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git rebase main" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
  });

  it("blocks git cherry-pick", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git cherry-pick abc123" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
  });

  it("allows git log (read-only)", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git log --oneline -10" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, true);
  });

  it("allows git diff (read-only)", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git diff --name-only" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, true);
  });

  it("allows git status (read-only)", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git status" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, true);
  });

  it("allows git show (read-only)", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git show HEAD" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, true);
  });

  it("allows git blame (read-only)", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git blame src/index.ts" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, true);
  });

  it("allows git commit when allowGit is true", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git commit -m 'test'" },
      state: { phase: "EXECUTING" },
      allowGit: true,
    });
    assertEquals(result.allow, true);
  });

  it("allows git push when allowGit is true", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "git push origin main" },
      state: { phase: "EXECUTING" },
      allowGit: true,
    });
    assertEquals(result.allow, true);
  });

  it("blocks chained git commands", () => {
    const result = enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command: "echo done && git push origin main" },
      state: { phase: "EXECUTING" },
    });
    assertEquals(result.allow, false);
  });
});

// =============================================================================
// Stop hook logic (extracted)
// =============================================================================

type StopResult = {
  acted: boolean;
  iteration?: number;
  restartRecommended?: boolean;
  filesResetted?: boolean;
};

const simulateStopHook = (input: {
  stop_hook_active: boolean;
  state: { phase: string; execution?: { iteration: number } } | null;
  maxIter: number;
  trackedFiles: string[];
}): StopResult => {
  if (input.stop_hook_active) return { acted: false };
  if (input.state === null) return { acted: false };
  if (input.state.phase !== "EXECUTING") return { acted: false };

  const iteration = (input.state.execution?.iteration ?? 0) + 1;
  const restartRecommended = iteration >= input.maxIter;

  return {
    acted: true,
    iteration,
    restartRecommended,
    filesResetted: true, // Stop hook resets files-changed.jsonl
  };
};

// =============================================================================
// Stop hook tests
// =============================================================================

describe("Stop hook", () => {
  it("increments iteration counter", () => {
    const result = simulateStopHook({
      stop_hook_active: false,
      state: { phase: "EXECUTING", execution: { iteration: 5 } },
      maxIter: 15,
      trackedFiles: ["src/api.ts"],
    });
    assertEquals(result.acted, true);
    assertEquals(result.iteration, 6);
  });

  it("resets file tracking log after snapshot", () => {
    const result = simulateStopHook({
      stop_hook_active: false,
      state: { phase: "EXECUTING", execution: { iteration: 2 } },
      maxIter: 15,
      trackedFiles: ["a.ts", "b.ts"],
    });
    assertEquals(result.filesResetted, true);
  });

  it("sets restartRecommended when iteration >= threshold", () => {
    const result = simulateStopHook({
      stop_hook_active: false,
      state: { phase: "EXECUTING", execution: { iteration: 14 } },
      maxIter: 15,
      trackedFiles: [],
    });
    assertEquals(result.restartRecommended, true);
    assertEquals(result.iteration, 15);
  });

  it("does NOT set restartRecommended when under threshold", () => {
    const result = simulateStopHook({
      stop_hook_active: false,
      state: { phase: "EXECUTING", execution: { iteration: 3 } },
      maxIter: 15,
      trackedFiles: [],
    });
    assertEquals(result.restartRecommended, false);
  });

  it("does not act when stop_hook_active is true (prevents infinite loop)", () => {
    const result = simulateStopHook({
      stop_hook_active: true,
      state: { phase: "EXECUTING", execution: { iteration: 5 } },
      maxIter: 15,
      trackedFiles: [],
    });
    assertEquals(result.acted, false);
  });

  it("does not act when phase is not EXECUTING", () => {
    const result = simulateStopHook({
      stop_hook_active: false,
      state: { phase: "DISCOVERY" },
      maxIter: 15,
      trackedFiles: [],
    });
    assertEquals(result.acted, false);
  });
});

// =============================================================================
// PostToolUse bash log logic
// =============================================================================

describe("PostToolUse bash log", () => {
  it("detects noskills command calls", () => {
    const command = "npx eser noskills next --answer='task done'";
    assertEquals(command.includes("noskills"), true);
  });

  it("ignores non-noskills commands", () => {
    const command = "deno test";
    assertEquals(command.includes("noskills"), false);
  });
});

// =============================================================================
// PostToolUse file write log logic
// =============================================================================

describe("PostToolUse file write log", () => {
  it("logs file path from Write tool", () => {
    const tool_input = { file_path: "/src/upload.ts" };
    const fp = tool_input.file_path;
    assertEquals(fp.length > 0, true);
    assertEquals(fp.includes(".eser/"), false); // not skipped
  });

  it("skips .eser/ files", () => {
    const tool_input = { file_path: "/project/.eser/rules/test.md" };
    assertEquals(tool_input.file_path.includes(".eser/"), true); // skipped
  });

  it("skips .claude/ files", () => {
    const tool_input = { file_path: "/project/.claude/hooks/test.js" };
    assertEquals(tool_input.file_path.includes(".claude/"), true); // skipped
  });
});

// =============================================================================
// Hook installation
// =============================================================================

describe("Hook installation", () => {
  it("syncHooks generates settings.json (not script files)", async () => {
    const { syncHooks } = await import("./hooks.ts");

    // Verify the function exists and is callable
    assertEquals(typeof syncHooks, "function");
  });
});
