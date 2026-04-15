// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as hookDecisions from "./hook-decisions.ts";

describe("isNoskillsCommand", () => {
  it("detects 'noskills' in command", () => {
    assertEquals(
      hookDecisions.isNoskillsCommand("deno task cli noskills next"),
      true,
    );
  });

  it("detects ' nos ' in command", () => {
    assertEquals(
      hookDecisions.isNoskillsCommand("deno task cli nos next"),
      true,
    );
  });

  it("detects 'nos' at start of command", () => {
    assertEquals(hookDecisions.isNoskillsCommand("nos next"), true);
  });

  it("detects 'nos' at end of command", () => {
    assertEquals(hookDecisions.isNoskillsCommand("echo nos"), true);
  });

  it("rejects non-noskills commands", () => {
    assertEquals(hookDecisions.isNoskillsCommand("rm -rf /"), false);
  });

  it("rejects empty command", () => {
    assertEquals(hookDecisions.isNoskillsCommand(""), false);
  });
});

describe("isGitAllowed", () => {
  // Unconditionally allowed (read-only) subcommands
  it("allows git log", () => {
    assertEquals(hookDecisions.isGitAllowed("git log"), true);
  });

  it("allows git log with args", () => {
    assertEquals(hookDecisions.isGitAllowed("git log --oneline -10"), true);
  });

  it("allows git diff", () => {
    assertEquals(hookDecisions.isGitAllowed("git diff"), true);
  });

  it("allows git diff with path", () => {
    assertEquals(hookDecisions.isGitAllowed("git diff HEAD -- file.ts"), true);
  });

  it("allows git status", () => {
    assertEquals(hookDecisions.isGitAllowed("git status"), true);
  });

  it("allows git show HEAD", () => {
    assertEquals(hookDecisions.isGitAllowed("git show HEAD"), true);
  });

  it("allows git blame file.ts", () => {
    assertEquals(hookDecisions.isGitAllowed("git blame file.ts"), true);
  });

  it("allows git rev-parse", () => {
    assertEquals(hookDecisions.isGitAllowed("git rev-parse HEAD"), true);
  });

  it("allows git ls-files", () => {
    assertEquals(hookDecisions.isGitAllowed("git ls-files"), true);
  });

  it("allows git describe", () => {
    assertEquals(hookDecisions.isGitAllowed("git describe --tags"), true);
  });

  it("allows git shortlog", () => {
    assertEquals(hookDecisions.isGitAllowed("git shortlog -sn"), true);
  });

  it("allows git help", () => {
    assertEquals(hookDecisions.isGitAllowed("git help"), true);
  });

  it("allows git version", () => {
    assertEquals(hookDecisions.isGitAllowed("git version"), true);
  });

  // Conditional: branch
  it("allows git branch --show-current (regression — was missing from allowlist)", () => {
    assertEquals(hookDecisions.isGitAllowed("git branch --show-current"), true);
  });

  it("allows git branch (bare list)", () => {
    assertEquals(hookDecisions.isGitAllowed("git branch"), true);
  });

  it("allows git branch -a", () => {
    assertEquals(hookDecisions.isGitAllowed("git branch -a"), true);
  });

  it("allows git branch --all", () => {
    assertEquals(hookDecisions.isGitAllowed("git branch --all"), true);
  });

  it("allows git branch -r", () => {
    assertEquals(hookDecisions.isGitAllowed("git branch -r"), true);
  });

  it("allows git branch -v", () => {
    assertEquals(hookDecisions.isGitAllowed("git branch -v"), true);
  });

  it("blocks git branch -d feature", () => {
    assertEquals(hookDecisions.isGitAllowed("git branch -d feature"), false);
  });

  it("blocks git branch -D main", () => {
    assertEquals(hookDecisions.isGitAllowed("git branch -D main"), false);
  });

  it("blocks git branch -m old new", () => {
    assertEquals(hookDecisions.isGitAllowed("git branch -m old new"), false);
  });

  it("blocks git branch new-branch-name", () => {
    assertEquals(
      hookDecisions.isGitAllowed("git branch new-branch-name"),
      false,
    );
  });

  // Conditional: tag
  it("allows git tag (bare list)", () => {
    assertEquals(hookDecisions.isGitAllowed("git tag"), true);
  });

  it("allows git tag -l", () => {
    assertEquals(hookDecisions.isGitAllowed("git tag -l"), true);
  });

  it("allows git tag --list", () => {
    assertEquals(hookDecisions.isGitAllowed("git tag --list"), true);
  });

  it("blocks git tag v1.0 (create)", () => {
    assertEquals(hookDecisions.isGitAllowed("git tag v1.0"), false);
  });

  it("blocks git tag -a v1.0 (annotated create)", () => {
    assertEquals(hookDecisions.isGitAllowed("git tag -a v1.0"), false);
  });

  it("blocks git tag -d v1.0 (delete)", () => {
    assertEquals(hookDecisions.isGitAllowed("git tag -d v1.0"), false);
  });

  // Conditional: stash
  it("blocks bare git stash (push implied)", () => {
    assertEquals(hookDecisions.isGitAllowed("git stash"), false);
  });

  it("allows git stash list", () => {
    assertEquals(hookDecisions.isGitAllowed("git stash list"), true);
  });

  it("allows git stash show", () => {
    assertEquals(hookDecisions.isGitAllowed("git stash show"), true);
  });

  it("blocks git stash pop", () => {
    assertEquals(hookDecisions.isGitAllowed("git stash pop"), false);
  });

  it("blocks git stash drop", () => {
    assertEquals(hookDecisions.isGitAllowed("git stash drop"), false);
  });

  it("blocks git stash push", () => {
    assertEquals(hookDecisions.isGitAllowed("git stash push"), false);
  });

  // Conditional: remote
  it("allows git remote (bare list)", () => {
    assertEquals(hookDecisions.isGitAllowed("git remote"), true);
  });

  it("allows git remote -v", () => {
    assertEquals(hookDecisions.isGitAllowed("git remote -v"), true);
  });

  it("allows git remote show origin", () => {
    assertEquals(hookDecisions.isGitAllowed("git remote show origin"), true);
  });

  it("blocks git remote add", () => {
    assertEquals(
      hookDecisions.isGitAllowed("git remote add origin url"),
      false,
    );
  });

  it("blocks git remote remove", () => {
    assertEquals(hookDecisions.isGitAllowed("git remote remove origin"), false);
  });

  // Blocked write commands
  it("blocks git commit", () => {
    assertEquals(hookDecisions.isGitAllowed("git commit -m test"), false);
  });

  it("blocks git push", () => {
    assertEquals(hookDecisions.isGitAllowed("git push"), false);
  });

  it("blocks git push origin main", () => {
    assertEquals(hookDecisions.isGitAllowed("git push origin main"), false);
  });

  it("blocks git checkout", () => {
    assertEquals(hookDecisions.isGitAllowed("git checkout branch"), false);
  });

  it("blocks git add", () => {
    assertEquals(hookDecisions.isGitAllowed("git add ."), false);
  });

  it("blocks git merge", () => {
    assertEquals(hookDecisions.isGitAllowed("git merge feature"), false);
  });

  it("blocks git rebase", () => {
    assertEquals(hookDecisions.isGitAllowed("git rebase main"), false);
  });

  it("blocks git reset", () => {
    assertEquals(hookDecisions.isGitAllowed("git reset --hard"), false);
  });

  it("blocks git cherry-pick", () => {
    assertEquals(hookDecisions.isGitAllowed("git cherry-pick abc123"), false);
  });

  it("blocks git revert", () => {
    assertEquals(hookDecisions.isGitAllowed("git revert HEAD"), false);
  });

  it("blocks git rm", () => {
    assertEquals(hookDecisions.isGitAllowed("git rm file.ts"), false);
  });

  it("blocks git mv", () => {
    assertEquals(hookDecisions.isGitAllowed("git mv a.ts b.ts"), false);
  });

  it("blocks git am", () => {
    assertEquals(hookDecisions.isGitAllowed("git am patch.diff"), false);
  });

  // Edge cases
  it("returns true for non-git command", () => {
    assertEquals(hookDecisions.isGitAllowed("echo hello"), true);
  });

  it("returns true for bare git", () => {
    assertEquals(hookDecisions.isGitAllowed("git"), true);
  });

  it("handles leading whitespace", () => {
    assertEquals(hookDecisions.isGitAllowed("  git stash list"), true);
  });

  it("handles leading whitespace on blocked", () => {
    assertEquals(hookDecisions.isGitAllowed("  git push"), false);
  });
});

describe("git guard with global flags", () => {
  it("git -C /path log -> allowed", () => {
    assertEquals(
      hookDecisions.isGitAllowed("git -C /path log --oneline"),
      true,
    );
  });

  it("git -C /path commit -> blocked", () => {
    assertEquals(
      hookDecisions.isGitAllowed("git -C /path commit -m test"),
      false,
    );
  });

  it("git --git-dir=/path log -> allowed", () => {
    assertEquals(hookDecisions.isGitAllowed("git --git-dir=/path log"), true);
  });

  it("git -c core.autocrlf=true status -> allowed", () => {
    assertEquals(
      hookDecisions.isGitAllowed("git -c core.autocrlf=true status"),
      true,
    );
  });

  it("git log -> allowed (unchanged)", () => {
    assertEquals(hookDecisions.isGitAllowed("git log"), true);
  });

  it("git commit -> blocked (unchanged)", () => {
    assertEquals(hookDecisions.isGitAllowed("git commit"), false);
  });

  it("git -C /path -c x=y diff -> allowed (multiple global flags)", () => {
    assertEquals(
      hookDecisions.isGitAllowed("git -C /path -c x=y diff"),
      true,
    );
  });

  it("git --no-pager log -> allowed", () => {
    assertEquals(hookDecisions.isGitAllowed("git --no-pager log"), true);
  });

  it("git -C/path log -> allowed (no space after -C)", () => {
    assertEquals(hookDecisions.isGitAllowed("git -C/path log"), true);
  });

  it("git --work-tree=/tmp status -> allowed", () => {
    assertEquals(
      hookDecisions.isGitAllowed("git --work-tree=/tmp status"),
      true,
    );
  });

  it("git -C /path push -> blocked", () => {
    assertEquals(hookDecisions.isGitAllowed("git -C /path push"), false);
  });

  it("git --bare branch -> conditional (bare branch = allowed)", () => {
    assertEquals(hookDecisions.isGitAllowed("git --bare branch"), true);
  });

  it("git -C /path branch -D main -> blocked", () => {
    assertEquals(
      hookDecisions.isGitAllowed("git -C /path branch -D main"),
      false,
    );
  });
});

// Backward-compat alias
describe("isGitReadOnly", () => {
  it("is the same function as isGitAllowed", () => {
    assertEquals(hookDecisions.isGitReadOnly("git stash list"), true);
    assertEquals(hookDecisions.isGitReadOnly("git stash drop"), false);
    assertEquals(hookDecisions.isGitReadOnly("git log"), true);
    assertEquals(hookDecisions.isGitReadOnly("git commit -m x"), false);
  });
});

describe("containsGitWriteBypass", () => {
  it("detects bash -c git commit", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass('bash -c "git commit -m test"'),
      true,
    );
  });

  it("detects sh -c git push", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass('sh -c "git push"'),
      true,
    );
  });

  it("detects /bin/bash -c git add", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass('/bin/bash -c "git add ."'),
      true,
    );
  });

  it("detects eval git commit", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass('eval "git commit"'),
      true,
    );
  });

  it("detects pipe to git commit", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass("echo msg | git commit --file=-"),
      true,
    );
  });

  it("detects git add in matchAll fallback", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass("$(git add .)"),
      true,
    );
  });

  it("allows bash -c git log", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass('bash -c "git log"'),
      false,
    );
  });

  it("allows _B=$(git branch --show-current) (regression — was blocked)", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass("_B=$(git branch --show-current)"),
      false,
    );
  });

  it("allows BRANCH=$(git branch --show-current) && echo $BRANCH", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass(
        "BRANCH=$(git branch --show-current) && echo $BRANCH",
      ),
      false,
    );
  });

  it("allows pipe to git log", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass("echo test | git log"),
      false,
    );
  });

  it("allows bash -c git diff", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass('bash -c "git diff --stat"'),
      false,
    );
  });

  it("returns false for no git mentions", () => {
    assertEquals(
      hookDecisions.containsGitWriteBypass("echo hello world"),
      false,
    );
  });
});

// =============================================================================
// stripFlagValues — prevents user text from triggering git guard
// =============================================================================

describe("stripFlagValues", () => {
  it("strips double-quoted flag values", () => {
    const result = hookDecisions.stripFlagValues(
      'noskills next --answer="use git branching strategy"',
    );
    assertEquals(result.includes("git branching"), false);
    assertEquals(result.includes("noskills next"), true);
  });

  it("strips single-quoted flag values", () => {
    const result = hookDecisions.stripFlagValues(
      "noskills next --answer='digital transformation'",
    );
    assertEquals(result.includes("digital"), false);
  });

  it("strips unquoted flag values", () => {
    const result = hookDecisions.stripFlagValues(
      "noskills next --answer=legitimate",
    );
    assertEquals(result.includes("legitimate"), false);
  });

  it("preserves actual commands after stripping", () => {
    const result = hookDecisions.stripFlagValues(
      'noskills next --answer="test" && git push',
    );
    assertEquals(result.includes("git push"), true);
  });

  it("strips multiple flags", () => {
    const result = hookDecisions.stripFlagValues(
      'noskills block --reason="git issue" --spec="git-migration"',
    );
    assertEquals(result.includes("git issue"), false);
    assertEquals(result.includes("git-migration"), false);
  });

  it("returns command unchanged when no flags", () => {
    assertEquals(
      hookDecisions.stripFlagValues("git commit -m test"),
      "git commit -m test",
    );
  });
});

// =============================================================================
// extractGitInvocations — multi-line / subshell aware extraction
// =============================================================================

describe("extractGitInvocations", () => {
  // Single-phrase commands
  it("extracts single git read command", () => {
    const result = hookDecisions.extractGitInvocations("git log --oneline");
    assertEquals(result.length, 1);
    assertEquals(result[0], "git log --oneline");
  });

  it("extracts single git write command", () => {
    const result = hookDecisions.extractGitInvocations("git commit -m test");
    assertEquals(result.length, 1);
    assertEquals(result[0], "git commit -m test");
  });

  it("returns empty array for non-git command", () => {
    const result = hookDecisions.extractGitInvocations("echo hello world");
    assertEquals(result.length, 0);
  });

  // && chains
  it("extracts both reads from && chain", () => {
    const result = hookDecisions.extractGitInvocations(
      "git status && git log --oneline",
    );
    assertEquals(result.length, 2);
    assertEquals(result[0], "git status");
    assertEquals(result[1], "git log --oneline");
  });

  it("extracts write from mixed && chain (read then write)", () => {
    const result = hookDecisions.extractGitInvocations(
      "git status && git commit -m test",
    );
    assertEquals(result.length, 2);
    assertEquals(result[1], "git commit -m test");
  });

  // || separators
  it("extracts read from || chain", () => {
    const result = hookDecisions.extractGitInvocations(
      "git status 2>/dev/null || true",
    );
    assertEquals(result.length >= 1, true);
    assertEquals(result[0]!.startsWith("git status"), true);
  });

  // Semicolon chains
  it("extracts reads from ; chain", () => {
    const result = hookDecisions.extractGitInvocations("git diff; git status");
    assertEquals(result.length, 2);
  });

  // Multi-line scripts (newline separator — the key gap this fixes)
  it("extracts reads from multi-line script with only reads", () => {
    const script = "git log --oneline\ngit status\ngit diff";
    const result = hookDecisions.extractGitInvocations(script);
    assertEquals(result.length, 3);
    assertEquals(result[0], "git log --oneline");
    assertEquals(result[1], "git status");
    assertEquals(result[2], "git diff");
  });

  it("extracts write from multi-line script containing one write", () => {
    const script = "git log --oneline\ngit status\ngit push origin main";
    const result = hookDecisions.extractGitInvocations(script);
    assertEquals(result.length, 3);
    assertEquals(result[2], "git push origin main");
  });

  // Variable-assignment subshell wrapping: $(git ...)
  it("extracts read from variable assignment $(git branch --show-current)", () => {
    const result = hookDecisions.extractGitInvocations(
      "_B=$(git branch --show-current)",
    );
    assertEquals(result.length, 1);
    assertEquals(result[0], "git branch --show-current");
  });

  it("extracts read from BRANCH=$(git branch --show-current) && echo", () => {
    const result = hookDecisions.extractGitInvocations(
      "BRANCH=$(git branch --show-current) && echo $BRANCH",
    );
    assertEquals(result.length >= 1, true);
    assertEquals(result[0], "git branch --show-current");
  });

  // Pipe-wrapped reads
  it("stops fragment at pipe — git log before | head", () => {
    const result = hookDecisions.extractGitInvocations("git log | head -5");
    assertEquals(result.length, 1);
    assertEquals(result[0]!.includes("head"), false);
    assertEquals(result[0]!.startsWith("git log"), true);
  });

  // "git" inside quoted strings — should NOT be extracted as a command
  it("does not extract git from double-quoted string content", () => {
    const result = hookDecisions.extractGitInvocations('echo "git is great"');
    assertEquals(result.length, 0);
  });

  // gstack preamble pattern (multi-line, reads only)
  it("gstack preamble multi-line script — all reads, no writes", () => {
    const preamble = [
      "_BRANCH=$(git branch --show-current 2>/dev/null || echo 'unknown')",
      'echo "BRANCH: $_BRANCH"',
    ].join("\n");
    const result = hookDecisions.extractGitInvocations(preamble);
    for (const inv of result) {
      assertEquals(
        hookDecisions.isGitAllowed(inv),
        true,
        `Expected allowed but got blocked: ${inv}`,
      );
    }
  });

  // stash conditional
  it("extracts git stash list as read (isGitAllowed → true)", () => {
    const result = hookDecisions.extractGitInvocations("git stash list");
    assertEquals(result.length, 1);
    assertEquals(hookDecisions.isGitAllowed(result[0]!), true);
  });

  it("extracts bare git stash as write implied (isGitAllowed → false)", () => {
    const result = hookDecisions.extractGitInvocations("git stash");
    assertEquals(result.length, 1);
    assertEquals(hookDecisions.isGitAllowed(result[0]!), false);
  });

  // branch conditional
  it("extracts git branch --show-current as read (isGitAllowed → true)", () => {
    const result = hookDecisions.extractGitInvocations(
      "git branch --show-current",
    );
    assertEquals(result.length, 1);
    assertEquals(hookDecisions.isGitAllowed(result[0]!), true);
  });

  it("extracts git branch -d feature as write (isGitAllowed → false)", () => {
    const result = hookDecisions.extractGitInvocations("git branch -d feature");
    assertEquals(result.length, 1);
    assertEquals(hookDecisions.isGitAllowed(result[0]!), false);
  });

  // global flags preserved in fragment
  it("extracts git -C /path log including global flag (isGitAllowed → true)", () => {
    const result = hookDecisions.extractGitInvocations(
      "git -C /repo log --oneline",
    );
    assertEquals(result.length, 1);
    assertEquals(hookDecisions.isGitAllowed(result[0]!), true);
  });
});
