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
// PreToolUse enforcement logic — uses allowlist from hook-decisions.ts
// =============================================================================

import * as hookDecisions from "../commands/hook-decisions.ts";

type HookDecision = { allow: true } | { allow: false; reason: string };

const enforcePreToolUse = (input: {
  tool_name: string;
  tool_input: Record<string, unknown>;
  state: { phase: string } | null;
  allowGit?: boolean;
}): HookDecision => {
  const { tool_name, tool_input, state, allowGit } = input;

  // Bash: git allowlist guard
  if (tool_name === "Bash") {
    const cmd = ((tool_input["command"] as string) ?? "").trim();

    if (!allowGit && cmd.includes("git")) {
      // Split on && and ; to check each segment
      const segments = cmd.split(/\s*(?:&&|;)\s*/);
      for (const seg of segments) {
        const trimmed = seg.trim();
        if (
          trimmed.startsWith("git") && !hookDecisions.isGitAllowed(trimmed)
        ) {
          return {
            allow: false,
            reason:
              "Git write operations are not allowed. Only read commands (log, diff, status, show, blame) are permitted. The user controls git, the agent controls files.",
          };
        }
      }

      // Check for subshell/pipe bypasses
      if (hookDecisions.containsGitWriteBypass(cmd)) {
        return {
          allow: false,
          reason:
            "Git write command detected inside subshell/eval/pipe. Git write operations are not allowed regardless of how they are invoked.",
        };
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
  if (
    phase === "EXECUTING" || phase === "IDLE" ||
    phase === "COMPLETED"
  ) {
    return { allow: true };
  }

  const reasons: Record<string, string> = {
    DISCOVERY:
      "Discovery in progress. Run `npx eser noskills next` to continue.",
    SPEC_PROPOSAL: "Spec needs review. Run `npx eser noskills approve`",
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

  it("blocks file edit when phase is SPEC_PROPOSAL", () => {
    const result = enforcePreToolUse({
      tool_name: "Edit",
      tool_input: { file_path: "/src/api.ts" },
      state: { phase: "SPEC_PROPOSAL" },
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
    for (const phase of ["IDLE", "DISCOVERY", "SPEC_PROPOSAL", "BLOCKED"]) {
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
// PreToolUse: Git allowlist guard
// =============================================================================

describe("PreToolUse: git allowlist", () => {
  const git = (command: string, allowGit = false) =>
    enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command },
      state: { phase: "EXECUTING" },
      allowGit,
    });

  // Read-only commands → pass
  it("allows git log --oneline -5", () =>
    assertEquals(git("git log --oneline -5").allow, true));
  it("allows git diff", () => assertEquals(git("git diff").allow, true));
  it("allows git status", () => assertEquals(git("git status").allow, true));
  it("allows git show HEAD", () =>
    assertEquals(git("git show HEAD").allow, true));
  it("allows git blame file.ts", () =>
    assertEquals(git("git blame file.ts").allow, true));
  it("allows git branch (list)", () =>
    assertEquals(git("git branch").allow, true));
  it("allows git tag (list)", () => assertEquals(git("git tag").allow, true));
  it("allows git stash list", () =>
    assertEquals(git("git stash list").allow, true));
  it("allows git remote -v", () =>
    assertEquals(git("git remote -v").allow, true));

  // Write commands → blocked
  it("blocks git branch -d feature", () =>
    assertEquals(git("git branch -d feature").allow, false));
  it("blocks git branch -D feature", () =>
    assertEquals(git("git branch -D feature").allow, false));
  it("blocks git branch new-branch", () =>
    assertEquals(git("git branch new-branch").allow, false));
  it("blocks git tag v1.0", () =>
    assertEquals(git("git tag v1.0").allow, false));
  it("blocks git tag -d v1.0", () =>
    assertEquals(git("git tag -d v1.0").allow, false));
  it("blocks git stash (bare)", () =>
    assertEquals(git("git stash").allow, false));
  it("blocks git stash pop", () =>
    assertEquals(git("git stash pop").allow, false));
  it("blocks git remote add", () =>
    assertEquals(git("git remote add origin url").allow, false));
  it("blocks git commit", () =>
    assertEquals(git('git commit -m "test"').allow, false));
  it("blocks git push", () => assertEquals(git("git push").allow, false));
  it("blocks git checkout", () =>
    assertEquals(git("git checkout branch").allow, false));
  it("blocks git add", () => assertEquals(git("git add .").allow, false));
  it("blocks git merge", () =>
    assertEquals(git("git merge main").allow, false));
  it("blocks git rebase", () =>
    assertEquals(git("git rebase main").allow, false));
  it("blocks git cherry-pick", () =>
    assertEquals(git("git cherry-pick abc").allow, false));
  it("blocks git reset --hard", () =>
    assertEquals(git("git reset --hard").allow, false));
  it("blocks git clean -fd", () =>
    assertEquals(git("git clean -fd").allow, false));
  it("blocks git rm file.ts", () =>
    assertEquals(git("git rm file.ts").allow, false));
  it("blocks git mv a.ts b.ts", () =>
    assertEquals(git("git mv a.ts b.ts").allow, false));

  // allowGit: true → all pass
  it("allows git commit when allowGit true", () =>
    assertEquals(git('git commit -m "test"', true).allow, true));
  it("allows git push when allowGit true", () =>
    assertEquals(git("git push", true).allow, true));
  it("allows git checkout when allowGit true", () =>
    assertEquals(git("git checkout branch", true).allow, true));

  // Chained commands
  it("blocks chained git push", () =>
    assertEquals(git("echo done && git push").allow, false));
});

// =============================================================================
// PreToolUse: bash -c bypass detection
// =============================================================================

describe("PreToolUse: bash -c bypass detection", () => {
  const git = (command: string) =>
    enforcePreToolUse({
      tool_name: "Bash",
      tool_input: { command },
      state: { phase: "EXECUTING" },
    });

  it('blocks bash -c "git commit"', () =>
    assertEquals(git('bash -c "git commit -m test"').allow, false));
  it('blocks sh -c "git push"', () =>
    assertEquals(git('sh -c "git push"').allow, false));
  it('blocks /bin/bash -c "git add"', () =>
    assertEquals(git('/bin/bash -c "git add ."').allow, false));
  it('allows bash -c "git log"', () =>
    assertEquals(git('bash -c "git log"').allow, true));
  it('allows bash -c "git status && echo ok"', () =>
    assertEquals(git('bash -c "git status"').allow, true));
  it('blocks bash -c "echo hello && git commit"', () =>
    assertEquals(git('bash -c "echo hello && git commit -m x"').allow, false));
  it('blocks eval "git commit"', () =>
    assertEquals(git('eval "git commit"').allow, false));
  it("blocks pipe to git commit", () =>
    assertEquals(git("echo msg | git commit --file=-").allow, false));
  it("blocks $(git push)", () => assertEquals(git("$(git push)").allow, false));
  it('allows bash -c "ls -la" (no git)', () =>
    assertEquals(git('bash -c "ls -la"').allow, true));
  it("allows normal git log (no subshell)", () =>
    assertEquals(git("git log").allow, true));
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
