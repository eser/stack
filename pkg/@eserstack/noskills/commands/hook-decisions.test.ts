// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as hookDecisions from "./hook-decisions.ts";
import * as questions from "../context/questions.ts";
import * as machine from "../state/machine.ts";
import * as schema from "../state/schema.ts";

bdd.describe("isNoskillsCommand", () => {
  bdd.it("detects 'noskills' in command", () => {
    assert.assertEquals(
      hookDecisions.isNoskillsCommand("pnpm cli noskills next"),
      true,
    );
  });

  bdd.it("detects ' nos ' in command", () => {
    assert.assertEquals(
      hookDecisions.isNoskillsCommand("pnpm cli nos next"),
      true,
    );
  });

  bdd.it("detects 'nos' at start of command", () => {
    assert.assertEquals(hookDecisions.isNoskillsCommand("nos next"), true);
  });

  bdd.it("detects 'nos' at end of command", () => {
    assert.assertEquals(hookDecisions.isNoskillsCommand("echo nos"), true);
  });

  bdd.it("rejects non-noskills commands", () => {
    assert.assertEquals(hookDecisions.isNoskillsCommand("rm -rf /"), false);
  });

  bdd.it("rejects empty command", () => {
    assert.assertEquals(hookDecisions.isNoskillsCommand(""), false);
  });
});

bdd.describe("isGitAllowed", () => {
  // Unconditionally allowed (read-only) subcommands
  bdd.it("allows git log", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git log"), true);
  });

  bdd.it("allows git log with args", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git log --oneline -10"),
      true,
    );
  });

  bdd.it("allows git diff", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git diff"), true);
  });

  bdd.it("allows git diff with path", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git diff HEAD -- file.ts"),
      true,
    );
  });

  bdd.it("allows git status", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git status"), true);
  });

  bdd.it("allows git show HEAD", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git show HEAD"), true);
  });

  bdd.it("allows git blame file.ts", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git blame file.ts"), true);
  });

  bdd.it("allows git rev-parse", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git rev-parse HEAD"), true);
  });

  bdd.it("allows git ls-files", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git ls-files"), true);
  });

  bdd.it("allows git describe", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git describe --tags"),
      true,
    );
  });

  bdd.it("allows git shortlog", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git shortlog -sn"), true);
  });

  bdd.it("allows git help", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git help"), true);
  });

  bdd.it("allows git version", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git version"), true);
  });

  // Conditional: branch
  bdd.it(
    "allows git branch --show-current (regression — was missing from allowlist)",
    () => {
      assert.assertEquals(
        hookDecisions.isGitAllowed("git branch --show-current"),
        true,
      );
    },
  );

  bdd.it("allows git branch (bare list)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git branch"), true);
  });

  bdd.it("allows git branch -a", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git branch -a"), true);
  });

  bdd.it("allows git branch --all", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git branch --all"), true);
  });

  bdd.it("allows git branch -r", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git branch -r"), true);
  });

  bdd.it("allows git branch -v", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git branch -v"), true);
  });

  bdd.it("blocks git branch -d feature", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git branch -d feature"),
      false,
    );
  });

  bdd.it("blocks git branch -D main", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git branch -D main"),
      false,
    );
  });

  bdd.it("blocks git branch -m old new", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git branch -m old new"),
      false,
    );
  });

  bdd.it("blocks git branch new-branch-name", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git branch new-branch-name"),
      false,
    );
  });

  // Conditional: tag
  bdd.it("allows git tag (bare list)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git tag"), true);
  });

  bdd.it("allows git tag -l", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git tag -l"), true);
  });

  bdd.it("allows git tag --list", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git tag --list"), true);
  });

  bdd.it("blocks git tag v1.0 (create)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git tag v1.0"), false);
  });

  bdd.it("blocks git tag -a v1.0 (annotated create)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git tag -a v1.0"), false);
  });

  bdd.it("blocks git tag -d v1.0 (delete)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git tag -d v1.0"), false);
  });

  // Conditional: stash
  bdd.it("blocks bare git stash (push implied)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git stash"), false);
  });

  bdd.it("allows git stash list", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git stash list"), true);
  });

  bdd.it("allows git stash show", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git stash show"), true);
  });

  bdd.it("blocks git stash pop", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git stash pop"), false);
  });

  bdd.it("blocks git stash drop", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git stash drop"), false);
  });

  bdd.it("blocks git stash push", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git stash push"), false);
  });

  // Conditional: remote
  bdd.it("allows git remote (bare list)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git remote"), true);
  });

  bdd.it("allows git remote -v", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git remote -v"), true);
  });

  bdd.it("allows git remote show origin", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git remote show origin"),
      true,
    );
  });

  bdd.it("blocks git remote add", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git remote add origin url"),
      false,
    );
  });

  bdd.it("blocks git remote remove", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git remote remove origin"),
      false,
    );
  });

  // Blocked write commands
  bdd.it("blocks git commit", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git commit -m test"),
      false,
    );
  });

  bdd.it("blocks git push", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git push"), false);
  });

  bdd.it("blocks git push origin main", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git push origin main"),
      false,
    );
  });

  bdd.it("blocks git checkout", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git checkout branch"),
      false,
    );
  });

  bdd.it("blocks git add", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git add ."), false);
  });

  bdd.it("blocks git merge", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git merge feature"), false);
  });

  bdd.it("blocks git rebase", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git rebase main"), false);
  });

  bdd.it("blocks git reset", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git reset --hard"), false);
  });

  bdd.it("blocks git cherry-pick", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git cherry-pick abc123"),
      false,
    );
  });

  bdd.it("blocks git revert", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git revert HEAD"), false);
  });

  bdd.it("blocks git rm", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git rm file.ts"), false);
  });

  bdd.it("blocks git mv", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git mv a.ts b.ts"), false);
  });

  bdd.it("blocks git am", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git am patch.diff"), false);
  });

  // Edge cases
  bdd.it("returns true for non-git command", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("echo hello"), true);
  });

  bdd.it("returns true for bare git", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git"), true);
  });

  bdd.it("handles leading whitespace", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("  git stash list"), true);
  });

  bdd.it("handles leading whitespace on blocked", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("  git push"), false);
  });
});

bdd.describe("git guard with global flags", () => {
  bdd.it("git -C /path log -> allowed", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git -C /path log --oneline"),
      true,
    );
  });

  bdd.it("git -C /path commit -> blocked", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git -C /path commit -m test"),
      false,
    );
  });

  bdd.it("git --git-dir=/path log -> allowed", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git --git-dir=/path log"),
      true,
    );
  });

  bdd.it("git -c core.autocrlf=true status -> allowed", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git -c core.autocrlf=true status"),
      true,
    );
  });

  bdd.it("git log -> allowed (unchanged)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git log"), true);
  });

  bdd.it("git commit -> blocked (unchanged)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git commit"), false);
  });

  bdd.it("git -C /path -c x=y diff -> allowed (multiple global flags)", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git -C /path -c x=y diff"),
      true,
    );
  });

  bdd.it("git --no-pager log -> allowed", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git --no-pager log"), true);
  });

  bdd.it("git -C/path log -> allowed (no space after -C)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git -C/path log"), true);
  });

  bdd.it("git --work-tree=/tmp status -> allowed", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git --work-tree=/tmp status"),
      true,
    );
  });

  bdd.it("git -C /path push -> blocked", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git -C /path push"), false);
  });

  bdd.it("git --bare branch -> conditional (bare branch = allowed)", () => {
    assert.assertEquals(hookDecisions.isGitAllowed("git --bare branch"), true);
  });

  bdd.it("git -C /path branch -D main -> blocked", () => {
    assert.assertEquals(
      hookDecisions.isGitAllowed("git -C /path branch -D main"),
      false,
    );
  });
});

// Backward-compat alias
bdd.describe("isGitReadOnly", () => {
  bdd.it("is the same function as isGitAllowed", () => {
    assert.assertEquals(hookDecisions.isGitReadOnly("git stash list"), true);
    assert.assertEquals(hookDecisions.isGitReadOnly("git stash drop"), false);
    assert.assertEquals(hookDecisions.isGitReadOnly("git log"), true);
    assert.assertEquals(hookDecisions.isGitReadOnly("git commit -m x"), false);
  });
});

bdd.describe("containsGitWriteBypass", () => {
  bdd.it("detects bash -c git commit", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass('bash -c "git commit -m test"'),
      true,
    );
  });

  bdd.it("detects sh -c git push", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass('sh -c "git push"'),
      true,
    );
  });

  bdd.it("detects /bin/bash -c git add", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass('/bin/bash -c "git add ."'),
      true,
    );
  });

  bdd.it("detects eval git commit", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass('eval "git commit"'),
      true,
    );
  });

  bdd.it("detects pipe to git commit", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass("echo msg | git commit --file=-"),
      true,
    );
  });

  bdd.it("detects git add in matchAll fallback", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass("$(git add .)"),
      true,
    );
  });

  bdd.it("allows bash -c git log", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass('bash -c "git log"'),
      false,
    );
  });

  bdd.it(
    "allows _B=$(git branch --show-current) (regression — was blocked)",
    () => {
      assert.assertEquals(
        hookDecisions.containsGitWriteBypass("_B=$(git branch --show-current)"),
        false,
      );
    },
  );

  bdd.it("allows BRANCH=$(git branch --show-current) && echo $BRANCH", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass(
        "BRANCH=$(git branch --show-current) && echo $BRANCH",
      ),
      false,
    );
  });

  bdd.it("allows pipe to git log", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass("echo test | git log"),
      false,
    );
  });

  bdd.it("allows bash -c git diff", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass('bash -c "git diff --stat"'),
      false,
    );
  });

  bdd.it("returns false for no git mentions", () => {
    assert.assertEquals(
      hookDecisions.containsGitWriteBypass("echo hello world"),
      false,
    );
  });
});

// =============================================================================
// stripFlagValues — prevents user text from triggering git guard
// =============================================================================

bdd.describe("stripFlagValues", () => {
  bdd.it("strips double-quoted flag values", () => {
    const result = hookDecisions.stripFlagValues(
      'noskills next --answer="use git branching strategy"',
    );
    assert.assertEquals(result.includes("git branching"), false);
    assert.assertEquals(result.includes("noskills next"), true);
  });

  bdd.it("strips single-quoted flag values", () => {
    const result = hookDecisions.stripFlagValues(
      "noskills next --answer='digital transformation'",
    );
    assert.assertEquals(result.includes("digital"), false);
  });

  bdd.it("strips unquoted flag values", () => {
    const result = hookDecisions.stripFlagValues(
      "noskills next --answer=legitimate",
    );
    assert.assertEquals(result.includes("legitimate"), false);
  });

  bdd.it("preserves actual commands after stripping", () => {
    const result = hookDecisions.stripFlagValues(
      'noskills next --answer="test" && git push',
    );
    assert.assertEquals(result.includes("git push"), true);
  });

  bdd.it("strips multiple flags", () => {
    const result = hookDecisions.stripFlagValues(
      'noskills block --reason="git issue" --spec="git-migration"',
    );
    assert.assertEquals(result.includes("git issue"), false);
    assert.assertEquals(result.includes("git-migration"), false);
  });

  bdd.it("returns command unchanged when no flags", () => {
    assert.assertEquals(
      hookDecisions.stripFlagValues("git commit -m test"),
      "git commit -m test",
    );
  });
});

// =============================================================================
// extractGitInvocations — multi-line / subshell aware extraction
// =============================================================================

bdd.describe("extractGitInvocations", () => {
  // Single-phrase commands
  bdd.it("extracts single git read command", () => {
    const result = hookDecisions.extractGitInvocations("git log --oneline");
    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0], "git log --oneline");
  });

  bdd.it("extracts single git write command", () => {
    const result = hookDecisions.extractGitInvocations("git commit -m test");
    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0], "git commit -m test");
  });

  bdd.it("returns empty array for non-git command", () => {
    const result = hookDecisions.extractGitInvocations("echo hello world");
    assert.assertEquals(result.length, 0);
  });

  // && chains
  bdd.it("extracts both reads from && chain", () => {
    const result = hookDecisions.extractGitInvocations(
      "git status && git log --oneline",
    );
    assert.assertEquals(result.length, 2);
    assert.assertEquals(result[0], "git status");
    assert.assertEquals(result[1], "git log --oneline");
  });

  bdd.it("extracts write from mixed && chain (read then write)", () => {
    const result = hookDecisions.extractGitInvocations(
      "git status && git commit -m test",
    );
    assert.assertEquals(result.length, 2);
    assert.assertEquals(result[1], "git commit -m test");
  });

  // || separators
  bdd.it("extracts read from || chain", () => {
    const result = hookDecisions.extractGitInvocations(
      "git status 2>/dev/null || true",
    );
    assert.assertEquals(result.length >= 1, true);
    assert.assertEquals(result[0]!.startsWith("git status"), true);
  });

  // Semicolon chains
  bdd.it("extracts reads from ; chain", () => {
    const result = hookDecisions.extractGitInvocations("git diff; git status");
    assert.assertEquals(result.length, 2);
  });

  // Multi-line scripts (newline separator — the key gap this fixes)
  bdd.it("extracts reads from multi-line script with only reads", () => {
    const script = "git log --oneline\ngit status\ngit diff";
    const result = hookDecisions.extractGitInvocations(script);
    assert.assertEquals(result.length, 3);
    assert.assertEquals(result[0], "git log --oneline");
    assert.assertEquals(result[1], "git status");
    assert.assertEquals(result[2], "git diff");
  });

  bdd.it("extracts write from multi-line script containing one write", () => {
    const script = "git log --oneline\ngit status\ngit push origin main";
    const result = hookDecisions.extractGitInvocations(script);
    assert.assertEquals(result.length, 3);
    assert.assertEquals(result[2], "git push origin main");
  });

  // Variable-assignment subshell wrapping: $(git ...)
  bdd.it(
    "extracts read from variable assignment $(git branch --show-current)",
    () => {
      const result = hookDecisions.extractGitInvocations(
        "_B=$(git branch --show-current)",
      );
      assert.assertEquals(result.length, 1);
      assert.assertEquals(result[0], "git branch --show-current");
    },
  );

  bdd.it(
    "extracts read from BRANCH=$(git branch --show-current) && echo",
    () => {
      const result = hookDecisions.extractGitInvocations(
        "BRANCH=$(git branch --show-current) && echo $BRANCH",
      );
      assert.assertEquals(result.length >= 1, true);
      assert.assertEquals(result[0], "git branch --show-current");
    },
  );

  // Pipe-wrapped reads
  bdd.it("stops fragment at pipe — git log before | head", () => {
    const result = hookDecisions.extractGitInvocations("git log | head -5");
    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0]!.includes("head"), false);
    assert.assertEquals(result[0]!.startsWith("git log"), true);
  });

  // "git" inside quoted strings — should NOT be extracted as a command
  bdd.it("does not extract git from double-quoted string content", () => {
    const result = hookDecisions.extractGitInvocations('echo "git is great"');
    assert.assertEquals(result.length, 0);
  });

  // gstack preamble pattern (multi-line, reads only)
  bdd.it("gstack preamble multi-line script — all reads, no writes", () => {
    const preamble = [
      "_BRANCH=$(git branch --show-current 2>/dev/null || echo 'unknown')",
      'echo "BRANCH: $_BRANCH"',
    ].join("\n");
    const result = hookDecisions.extractGitInvocations(preamble);
    for (const inv of result) {
      assert.assertEquals(
        hookDecisions.isGitAllowed(inv),
        true,
        `Expected allowed but got blocked: ${inv}`,
      );
    }
  });

  // stash conditional
  bdd.it("extracts git stash list as read (isGitAllowed → true)", () => {
    const result = hookDecisions.extractGitInvocations("git stash list");
    assert.assertEquals(result.length, 1);
    assert.assertEquals(hookDecisions.isGitAllowed(result[0]!), true);
  });

  bdd.it(
    "extracts bare git stash as write implied (isGitAllowed → false)",
    () => {
      const result = hookDecisions.extractGitInvocations("git stash");
      assert.assertEquals(result.length, 1);
      assert.assertEquals(hookDecisions.isGitAllowed(result[0]!), false);
    },
  );

  // branch conditional
  bdd.it(
    "extracts git branch --show-current as read (isGitAllowed → true)",
    () => {
      const result = hookDecisions.extractGitInvocations(
        "git branch --show-current",
      );
      assert.assertEquals(result.length, 1);
      assert.assertEquals(hookDecisions.isGitAllowed(result[0]!), true);
    },
  );

  bdd.it(
    "extracts git branch -d feature as write (isGitAllowed → false)",
    () => {
      const result = hookDecisions.extractGitInvocations(
        "git branch -d feature",
      );
      assert.assertEquals(result.length, 1);
      assert.assertEquals(hookDecisions.isGitAllowed(result[0]!), false);
    },
  );

  // global flags preserved in fragment
  bdd.it(
    "extracts git -C /path log including global flag (isGitAllowed → true)",
    () => {
      const result = hookDecisions.extractGitInvocations(
        "git -C /repo log --oneline",
      );
      assert.assertEquals(result.length, 1);
      assert.assertEquals(hookDecisions.isGitAllowed(result[0]!), true);
    },
  );
});

bdd.describe("preToolUseContext", () => {
  const cases = [
    {
      name: "returns null when there is no reminder and no file rule",
      reminder: null,
      fileRules: [],
      expected: null,
    },
    {
      name: "returns the reminder alone",
      reminder: hookDecisions.EXECUTOR_REMINDER,
      fileRules: [],
      expected: hookDecisions.EXECUTOR_REMINDER,
    },
    {
      name: "lists file rules under a heading",
      reminder: null,
      fileRules: ["use namespace imports", "(src/) no console"],
      expected:
        "[noskills] Rules for this file:\n- use namespace imports\n- (src/) no console",
    },
    {
      name: "puts the reminder before the file rules",
      reminder: hookDecisions.EXECUTOR_REMINDER,
      fileRules: ["use namespace imports"],
      expected:
        `${hookDecisions.EXECUTOR_REMINDER}\n\n` +
        "[noskills] Rules for this file:\n- use namespace imports",
    },
  ];

  for (const { name, reminder, fileRules, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(
        hookDecisions.preToolUseContext(reminder, fileRules),
        expected,
      );
    });
  }
});

bdd.describe("restartNotice", () => {
  const cases = [
    { name: "is null below the threshold", iteration: 14, expected: null },
    {
      name: "names the iteration at the threshold",
      iteration: 15,
      expected:
        "noskills: iteration 15 reached threshold (15). Consider starting a fresh conversation.\n",
    },
    {
      name: "names the iteration past the threshold",
      iteration: 31,
      expected:
        "noskills: iteration 31 reached threshold (15). Consider starting a fresh conversation.\n",
    },
  ];

  for (const { name, iteration, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(hookDecisions.restartNotice(iteration, 15), expected);
    });
  }
});

// TASK-323: a manifest without maxIterationsBeforeRestart used to pass
// undefined to restartNotice, so the notice never showed.
bdd.describe("restartThreshold", () => {
  bdd.it("defaults to 15 without a manifest or the setting", () => {
    assert.assertEquals(hookDecisions.restartThreshold(null), 15);
    assert.assertEquals(hookDecisions.restartThreshold({}), 15);
  });

  bdd.it("takes a positive whole number from the manifest", () => {
    assert.assertEquals(
      hookDecisions.restartThreshold({ maxIterationsBeforeRestart: 4 }),
      4,
    );
  });

  bdd.it("ignores a value that is not a positive whole number", () => {
    for (const value of [0, -2, 2.5, "8", null]) {
      assert.assertEquals(
        hookDecisions.restartThreshold({ maxIterationsBeforeRestart: value }),
        15,
      );
    }
  });
});

// TASK-323: an empty NOSKILLS_REAL_GIT used to be taken as the git path and
// crash the check; it means "not set", as in the Go hook.
bdd.describe("explicitRealGit", () => {
  bdd.it("treats an unset or empty variable as not given", () => {
    assert.assertEquals(hookDecisions.explicitRealGit(undefined), undefined);
    assert.assertEquals(hookDecisions.explicitRealGit(""), undefined);
  });

  bdd.it("keeps a path", () => {
    assert.assertEquals(
      hookDecisions.explicitRealGit("/usr/bin/git"),
      "/usr/bin/git",
    );
  });
});

// =============================================================================
// Protected files
// =============================================================================

bdd.describe("protectedFileAt", () => {
  const cases: readonly {
    readonly name: string;
    readonly path: string;
    readonly expected: hookDecisions.ProtectedFile | null;
  }[] = [
    {
      name: "finds the manifest",
      path: "/p/.eser/manifest.yml",
      expected: "manifest",
    },
    {
      name: "finds the manifest in another case",
      path: "/p/.ESER/Manifest.yml",
      expected: "manifest",
    },
    {
      name: "finds the manifest in a Windows path",
      path: "C:\\p\\.eser\\manifest.yml",
      expected: "manifest",
    },
    {
      name: "finds the wrapper script",
      path: "/p/.eser/.state/bin/git",
      expected: "git-wrapper",
    },
    {
      name: "finds the wrapper directory itself",
      path: "/p/.eser/.state/bin",
      expected: "git-wrapper",
    },
    {
      name: "leaves a directory that only starts with bin",
      path: "/p/.eser/.state/binary/x",
      expected: null,
    },
    {
      name: "leaves rules under .eser",
      path: "/p/.eser/rules/x.md",
      expected: null,
    },
    {
      name: "leaves a manifest outside .eser",
      path: "/p/k8s/manifest.yml",
      expected: null,
    },
  ];

  for (const { name, path, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(hookDecisions.protectedFileAt(path), expected);
    });
  }
});

bdd.describe("contentAfterEdit", () => {
  const manifest = "noskills:\n  allowGit: false\n";

  bdd.it("returns the content a Write gives", () => {
    assert.assertEquals(
      hookDecisions.contentAfterEdit("Write", { content: "x: 1\n" }, null),
      "x: 1\n",
    );
  });

  bdd.it("applies an Edit to the first match", () => {
    assert.assertEquals(
      hookDecisions.contentAfterEdit(
        "Edit",
        {
          old_string: "false",
          new_string: "true",
        },
        "a: false\nb: false\n",
      ),
      "a: true\nb: false\n",
    );
  });

  bdd.it("applies an Edit with replace_all to every match", () => {
    assert.assertEquals(
      hookDecisions.contentAfterEdit(
        "Edit",
        {
          old_string: "false",
          new_string: "true",
          replace_all: true,
        },
        "a: false\nb: false\n",
      ),
      "a: true\nb: true\n",
    );
  });

  bdd.it("inserts replacement text with $ patterns as written", () => {
    assert.assertEquals(
      hookDecisions.contentAfterEdit(
        "Edit",
        {
          old_string: "false",
          new_string: "$&$&",
        },
        manifest,
      ),
      "noskills:\n  allowGit: $&$&\n",
    );
  });

  bdd.it("applies MultiEdit replacements in order", () => {
    assert.assertEquals(
      hookDecisions.contentAfterEdit(
        "MultiEdit",
        {
          edits: [
            { old_string: "allowGit: false", new_string: "allowGit: x" },
            { old_string: "x", new_string: "true" },
          ],
        },
        manifest,
      ),
      "noskills:\n  allowGit: true\n",
    );
  });

  const undecidable: readonly {
    readonly name: string;
    readonly toolName: string;
    readonly toolInput: Record<string, unknown>;
  }[] = [
    {
      name: "an Edit whose text is not in the file",
      toolName: "Edit",
      toolInput: { old_string: "missing", new_string: "x" },
    },
    {
      name: "an Edit without new_string",
      toolName: "Edit",
      toolInput: { old_string: "false" },
    },
    {
      name: "a MultiEdit without edits",
      toolName: "MultiEdit",
      toolInput: { edits: [] },
    },
    {
      name: "a tool it does not know",
      toolName: "NotebookEdit",
      toolInput: { new_source: "x" },
    },
  ];

  for (const { name, toolName, toolInput } of undecidable) {
    bdd.it(`returns null for ${name}`, () => {
      assert.assertEquals(
        hookDecisions.contentAfterEdit(toolName, toolInput, manifest),
        null,
      );
    });
  }
});

bdd.describe("changesNoskillsSection", () => {
  const manifest = [
    "# project settings",
    "workflows:",
    "  precommit: [fmt]",
    "noskills:",
    "  allowGit: false",
    "  command: npx eser@latest noskills",
    "",
  ].join("\n");

  const cases: readonly {
    readonly name: string;
    readonly before: string | null;
    readonly after: string;
    readonly expected: boolean;
  }[] = [
    {
      name: "setting allowGit is a change",
      before: manifest,
      after: manifest.replace("allowGit: false", "allowGit: true"),
      expected: true,
    },
    {
      name: "changing the command is a change",
      before: manifest,
      after: manifest.replace("npx eser@latest noskills", "true"),
      expected: true,
    },
    {
      name: "creating the manifest with a noskills section is a change",
      before: null,
      after: "noskills:\n  allowGit: true\n",
      expected: true,
    },
    {
      name: "a manifest that no longer parses is a change",
      before: manifest,
      after: `${manifest}noskills: [\n`,
      expected: true,
    },
    {
      name: "removing the section is a change",
      before: manifest,
      after: "workflows:\n  precommit: [fmt]\n",
      expected: true,
    },
    {
      name: "editing another section is not",
      before: manifest,
      after: manifest.replace("[fmt]", "[fmt, lint]"),
      expected: false,
    },
    {
      name: "editing a comment is not",
      before: manifest,
      after: manifest.replace("# project settings", "# settings"),
      expected: false,
    },
    {
      name: "reordering the section's keys is not",
      before: manifest,
      after: [
        "workflows:",
        "  precommit: [fmt]",
        "noskills:",
        "  command: npx eser@latest noskills",
        "  allowGit: false",
        "",
      ].join("\n"),
      expected: false,
    },
  ];

  for (const { name, before, after, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(
        hookDecisions.changesNoskillsSection(before, after),
        expected,
      );
    });
  }
});

bdd.describe("bashProtectedFile", () => {
  const cases: readonly {
    readonly command: string;
    readonly expected: hookDecisions.ProtectedFile | null;
  }[] = [
    // Reads pass.
    { command: "cat .eser/manifest.yml", expected: null },
    { command: "grep allowGit .eser/manifest.yml | head -3", expected: null },
    { command: "sed -n '1,20p' .eser/manifest.yml", expected: null },
    { command: "yq '.noskills.allowGit' .eser/manifest.yml", expected: null },
    { command: "cat .eser/manifest.yml 2>&1 | wc -l", expected: null },
    { command: "git diff .eser/manifest.yml", expected: null },
    { command: "ls .eser/.state/bin", expected: null },
    // Commands that name no protected file pass.
    { command: "pnpm cli noskills concern add x", expected: null },
    { command: "sed -i s/a/b/ k8s/manifest.yml", expected: null },
    {
      command: `noskills spec x next --answer="edit .eser/manifest.yml"`,
      expected: null,
    },
    // Writes are refused.
    {
      command:
        "sed -i '' 's/allowGit: false/allowGit: true/' .eser/manifest.yml",
      expected: "manifest",
    },
    {
      command: "echo 'allowGit: true' >> .eser/manifest.yml",
      expected: "manifest",
    },
    {
      command: "cd .eser && perl -pi -e 's/false/true/' manifest.yml",
      expected: "manifest",
    },
    {
      command: "yq -i '.noskills.allowGit = true' .eser/manifest.yml",
      expected: "manifest",
    },
    {
      command: `python3 -c "open('.eser/manifest.yml', 'a').write('x')"`,
      expected: "manifest",
    },
    { command: "cat $(echo .eser/manifest.yml)", expected: "manifest" },
    { command: "git checkout -- .eser/manifest.yml", expected: "manifest" },
    {
      command: "cp /usr/bin/git .eser/.state/bin/git",
      expected: "git-wrapper",
    },
    {
      command:
        "printf '#!/bin/sh\\nexec /usr/bin/git \"$@\"\\n' > .eser/.state/bin/git",
      expected: "git-wrapper",
    },
    // Removing a directory that holds the wrapper removes the wrapper too.
    { command: "rm -rf .eser/.state", expected: "git-wrapper" },
    { command: "rm -rf .eser/.state/*", expected: "git-wrapper" },
    { command: "mv .eser /tmp/old-eser", expected: "git-wrapper" },
    { command: "cd .eser/.state && rm -rf bin", expected: "git-wrapper" },
    { command: "cd .eser && rm -rf .state", expected: "git-wrapper" },
    { command: `find "$PWD/.eser" -delete`, expected: "git-wrapper" },
    // Reads of those directories, and paths below them, pass.
    { command: "ls -la .eser/.state", expected: null },
    { command: "mkdir -p .eser/rules", expected: null },
    {
      command: "rm .eser/.state/progresses/files-changed.jsonl",
      expected: null,
    },
    { command: "cp notes.md .eser/rules/notes.md", expected: null },
  ];

  for (const { command, expected } of cases) {
    bdd.it(`${expected === null ? "passes" : "refuses"}: ${command}`, () => {
      assert.assertEquals(hookDecisions.bashProtectedFile(command), expected);
    });
  }
});

bdd.describe("protectedFileDenial", () => {
  bdd.it("names allowGit for the manifest", () => {
    const reason = hookDecisions.protectedFileDenial("manifest", "edit");

    assert.assertStringIncludes(reason, ".eser/manifest.yml");
    assert.assertStringIncludes(reason, "allowGit");
  });

  bdd.it("names the wrapper directory for the wrapper", () => {
    assert.assertStringIncludes(
      hookDecisions.protectedFileDenial("git-wrapper", "command"),
      ".eser/.state/bin/",
    );
    assert.assertStringIncludes(
      hookDecisions.protectedFileDenial("git-wrapper", "edit"),
      ".eser/.state/bin/",
    );
  });

  bdd.it(
    "says why a change of unknown result to the manifest is refused",
    () => {
      const reason = hookDecisions.protectedFileDenial(
        "manifest",
        "unknown-edit",
      );

      assert.assertStringIncludes(reason, "does not show what the file holds");
      assert.assertStringIncludes(reason, "allowGit");
    },
  );
});

// =============================================================================
// Hook input
// =============================================================================

bdd.describe("parseHookInput", () => {
  const cases: readonly {
    readonly name: string;
    readonly text: string;
    readonly expected: Record<string, unknown>;
  }[] = [
    {
      name: "reads a JSON object",
      text: '{"tool_name":"Bash","cwd":"/p"}',
      expected: { tool_name: "Bash", cwd: "/p" },
    },
    { name: "gives {} for an array", text: "[1,2]", expected: {} },
    { name: "gives {} for null", text: "null", expected: {} },
    { name: "gives {} for text that is not JSON", text: "{oops", expected: {} },
    { name: "gives {} for no input", text: "", expected: {} },
  ];

  for (const { name, text, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(hookDecisions.parseHookInput(text), expected);
    });
  }
});

bdd.describe("toolInputOf and filePathOf", () => {
  bdd.it("reads file_path from tool_input", () => {
    const toolInput = hookDecisions.toolInputOf({
      tool_input: { file_path: "src/a.ts" },
    });

    assert.assertEquals(hookDecisions.filePathOf(toolInput), "src/a.ts");
  });

  bdd.it("falls back to path, as some tools name the field", () => {
    assert.assertEquals(
      hookDecisions.filePathOf({ file_path: "", path: "src/b.ts" }),
      "src/b.ts",
    );
  });

  bdd.it("gives empty values for missing or mistyped fields", () => {
    assert.assertEquals(hookDecisions.toolInputOf({ tool_input: [1] }), {});
    assert.assertEquals(hookDecisions.filePathOf({ file_path: 7 }), "");
    assert.assertEquals(
      hookDecisions.stringField({ command: 7 }, "command"),
      "",
    );
  });

  bdd.it("reads OpenCode's filePath", () => {
    assert.assertEquals(
      hookDecisions.filePathOf({ filePath: "src/c.ts" }),
      "src/c.ts",
    );
  });
});

bdd.describe("toolNameOf and toolInputOf across tools", () => {
  bdd.it("reads Copilot CLI's camelCase toolName and toolArgs", () => {
    const input = { toolName: "bash", toolArgs: { command: "ls" } };

    assert.assertEquals(hookDecisions.toolNameOf(input), "bash");
    assert.assertEquals(hookDecisions.toolInputOf(input), { command: "ls" });
  });

  bdd.it("parses toolArgs sent as a JSON string", () => {
    assert.assertEquals(
      hookDecisions.toolInputOf({ toolArgs: '{"command":"git status"}' }),
      { command: "git status" },
    );
  });

  bdd.it("keeps a tool input that is plain text as input", () => {
    assert.assertEquals(
      hookDecisions.toolInputOf({ tool_input: "*** Begin Patch" }),
      { input: "*** Begin Patch" },
    );
  });

  bdd.it("prefers tool_name and tool_input when both forms are there", () => {
    const input = {
      tool_name: "Bash",
      tool_input: { command: "a" },
      toolName: "bash",
      toolArgs: { command: "b" },
    };

    assert.assertEquals(hookDecisions.toolNameOf(input), "Bash");
    assert.assertEquals(hookDecisions.toolInputOf(input), { command: "a" });
  });
});

bdd.describe("toolCallOf", () => {
  const manifestEdit = {
    old_string: "allowGit: false",
    new_string: "allowGit: true",
    replace_all: false,
  };

  const cases: readonly {
    readonly name: string;
    readonly toolName: string;
    readonly toolInput: Record<string, unknown>;
    readonly expected: hookDecisions.ToolCall;
  }[] = [
    {
      name: "Claude Code's Bash",
      toolName: "Bash",
      toolInput: { command: "git push" },
      expected: { kind: "shell", command: "git push" },
    },
    {
      name: "Copilot CLI's powershell",
      toolName: "powershell",
      toolInput: { command: "git push" },
      expected: { kind: "shell", command: "git push" },
    },
    {
      name: "Kiro's execute_bash",
      toolName: "execute_bash",
      toolInput: { command: "git push", summary: "push" },
      expected: { kind: "shell", command: "git push" },
    },
    {
      name: "Kiro's shell alias",
      toolName: "shell",
      toolInput: { command: "git push" },
      expected: { kind: "shell", command: "git push" },
    },
    {
      name: "Claude Code's Edit",
      toolName: "Edit",
      toolInput: { file_path: "m.yml", ...manifestEdit },
      expected: {
        kind: "file",
        changes: [
          {
            path: "m.yml",
            edit: { tool: "Edit", input: manifestEdit },
          },
        ],
      },
    },
    {
      name: "OpenCode's edit",
      toolName: "edit",
      toolInput: {
        filePath: "m.yml",
        oldString: "allowGit: false",
        newString: "allowGit: true",
      },
      expected: {
        kind: "file",
        changes: [
          {
            path: "m.yml",
            edit: { tool: "Edit", input: manifestEdit },
          },
        ],
      },
    },
    {
      name: "OpenCode's write",
      toolName: "write",
      toolInput: { filePath: "a.ts", content: "x" },
      expected: {
        kind: "file",
        changes: [
          {
            path: "a.ts",
            edit: { tool: "Write", input: { content: "x" } },
          },
        ],
      },
    },
    {
      name: "Copilot CLI's edit",
      toolName: "edit",
      toolInput: {
        path: "m.yml",
        old_str: "allowGit: false",
        new_str: "allowGit: true",
      },
      expected: {
        kind: "file",
        changes: [
          {
            path: "m.yml",
            edit: { tool: "Edit", input: manifestEdit },
          },
        ],
      },
    },
    {
      name: "Copilot CLI's create",
      toolName: "create",
      toolInput: { path: "a.ts", file_text: "x" },
      expected: {
        kind: "file",
        changes: [
          {
            path: "a.ts",
            edit: { tool: "Write", input: { content: "x" } },
          },
        ],
      },
    },
    {
      name: "Kiro's fs_write creating a file",
      toolName: "fs_write",
      toolInput: { command: "create", path: "a.ts", file_text: "x" },
      expected: {
        kind: "file",
        changes: [
          {
            path: "a.ts",
            edit: { tool: "Write", input: { content: "x" } },
          },
        ],
      },
    },
    {
      name: "Kiro's fs_write appending, whose result is unknown",
      toolName: "fs_write",
      toolInput: { command: "append", path: "a.ts", new_str: "x" },
      expected: { kind: "file", changes: [{ path: "a.ts", edit: null }] },
    },
    {
      name: "Kiro's delete_file",
      toolName: "delete_file",
      toolInput: { path: "a.ts" },
      expected: { kind: "file", changes: [{ path: "a.ts", edit: null }] },
    },
    {
      name: "a write tool whose input does not show the content",
      toolName: "write",
      toolInput: { path: "a.ts", text: "x" },
      expected: { kind: "file", changes: [{ path: "a.ts", edit: null }] },
    },
    {
      name: "Codex's apply_patch, with the patch in command",
      toolName: "apply_patch",
      toolInput: {
        command:
          "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-a\n+b\n*** Add File: src/b.ts\n+x\n*** End Patch",
      },
      expected: {
        kind: "file",
        changes: [
          { path: "src/a.ts", edit: null },
          { path: "src/b.ts", edit: null },
        ],
      },
    },
    {
      name: "OpenCode's apply_patch, with the patch in patchText",
      toolName: "apply_patch",
      toolInput: {
        patchText:
          "*** Begin Patch\n*** Delete File: old.ts\n*** Update File: a.ts\n*** Move to: b.ts\n*** End Patch",
      },
      expected: {
        kind: "file",
        changes: [
          { path: "old.ts", edit: null },
          { path: "a.ts", edit: null },
          { path: "b.ts", edit: null },
        ],
      },
    },
    {
      name: "a file tool that names no file",
      toolName: "Write",
      toolInput: { content: "x" },
      expected: { kind: "file", changes: [] },
    },
    {
      name: "a read tool",
      toolName: "read",
      toolInput: { filePath: "a.ts" },
      expected: { kind: "other" },
    },
    {
      name: "an MCP tool",
      toolName: "mcp__fs__write",
      toolInput: { path: "a.ts" },
      expected: { kind: "other" },
    },
  ];

  for (const { name, toolName, toolInput, expected } of cases) {
    bdd.it(`maps ${name}`, () => {
      assert.assertEquals(
        hookDecisions.toolCallOf(toolName, toolInput),
        expected,
      );
    });
  }

  bdd.it("maps a MultiEdit's edits to Claude Code's field names", () => {
    assert.assertEquals(
      hookDecisions.toolCallOf("MultiEdit", {
        file_path: "a.ts",
        edits: [{ oldString: "a", newString: "b", replaceAll: true }],
      }),
      {
        kind: "file",
        changes: [
          {
            path: "a.ts",
            edit: {
              tool: "MultiEdit",
              input: {
                edits: [
                  {
                    old_string: "a",
                    new_string: "b",
                    replace_all: true,
                  },
                ],
              },
            },
          },
        ],
      },
    );
  });

  bdd.it("reads a Copilot CLI hook input whole", () => {
    assert.assertEquals(
      hookDecisions.hookToolCall({
        toolName: "bash",
        toolArgs: '{"command":"git commit -m x"}',
      }),
      { kind: "shell", command: "git commit -m x" },
    );
  });
});

bdd.describe("patchPaths", () => {
  bdd.it("lists each file once, in the patch's order", () => {
    assert.assertEquals(
      hookDecisions.patchPaths(
        "*** Update File: a.ts\n*** Move to: b.ts\n*** Update File: a.ts\n",
      ),
      ["a.ts", "b.ts"],
    );
  });

  bdd.it("gives nothing for text without file markers", () => {
    assert.assertEquals(hookDecisions.patchPaths("git push"), []);
  });
});

bdd.describe("hookDialectOf", () => {
  bdd.it("takes tool_name inputs as the claude dialect", () => {
    assert.assertEquals(
      hookDecisions.hookDialectOf({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
      }),
      "claude",
    );
  });

  bdd.it("takes camelCase toolName inputs as Copilot CLI's", () => {
    assert.assertEquals(
      hookDecisions.hookDialectOf({ toolName: "bash", toolArgs: "{}" }),
      "copilot",
    );
  });

  bdd.it("takes the camelCase preToolUse event as Kiro's", () => {
    assert.assertEquals(
      hookDecisions.hookDialectOf({
        hook_event_name: "preToolUse",
        tool_name: "fs_write",
      }),
      "kiro",
    );
  });
});

bdd.describe("hookRoot", () => {
  bdd.it("prefers the cwd the tool sends", () => {
    assert.assertEquals(
      hookDecisions.hookRoot({ cwd: "/from-tool" }, "/from-env", "/process"),
      "/from-tool",
    );
  });

  bdd.it(
    "falls back to NOSKILLS_PROJECT_ROOT, then the process directory",
    () => {
      assert.assertEquals(
        hookDecisions.hookRoot({ cwd: "" }, "/from-env", "/process"),
        "/from-env",
      );
      assert.assertEquals(
        hookDecisions.hookRoot({}, undefined, "/process"),
        "/process",
      );
      assert.assertEquals(
        hookDecisions.hookRoot({}, "", "/process"),
        "/process",
      );
    },
  );
});

// =============================================================================
// PreToolUse phase gate
// =============================================================================

bdd.describe("mostRestrictivePhase", () => {
  const cases: readonly {
    readonly phases: readonly (string | null)[];
    readonly expected: string;
  }[] = [
    { phases: [], expected: "IDLE" },
    { phases: [null, "COMPLETED"], expected: "IDLE" },
    { phases: ["EXECUTING", null], expected: "EXECUTING" },
    { phases: ["EXECUTING", "BLOCKED"], expected: "BLOCKED" },
    {
      phases: ["SPEC_APPROVED", "DISCOVERY", "EXECUTING"],
      expected: "DISCOVERY",
    },
    { phases: ["toString", "EXECUTING"], expected: "EXECUTING" },
  ];

  for (const { phases, expected } of cases) {
    bdd.it(`picks ${expected} from [${phases.join(", ")}]`, () => {
      assert.assertEquals(hookDecisions.mostRestrictivePhase(phases), expected);
    });
  }
});

bdd.describe("gateStateOf", () => {
  bdd.it("reads phase, spec and the review gate scope", () => {
    assert.assertEquals(
      hookDecisions.gateStateOf({
        phase: "EXECUTING",
        spec: "upload",
        execution: { criteriaScope: "review-gate" },
      }),
      { phase: "EXECUTING", spec: "upload", criteriaScope: "review-gate" },
    );
  });

  bdd.it("gives null for missing, empty or mistyped fields", () => {
    assert.assertEquals(
      hookDecisions.gateStateOf({ phase: "", spec: 3, execution: "x" }),
      { phase: null, spec: null, criteriaScope: null },
    );
  });
});

bdd.describe("fileEditVerdict", () => {
  const prefix = "pnpm cli noskills";
  const state = (
    phase: string | null,
    spec: string | null = "upload",
    criteriaScope: string | null = null,
  ): hookDecisions.GateState => ({ phase, spec, criteriaScope });

  const allowed: readonly {
    readonly name: string;
    readonly filePath: string;
    readonly state: hookDecisions.GateState;
    readonly kind: "allow" | "execute";
  }[] = [
    {
      name: "a rule under .eser in DISCOVERY",
      filePath: "/p/.eser/rules/naming.md",
      state: state("DISCOVERY"),
      kind: "allow",
    },
    {
      name: "tool settings under .claude in BLOCKED",
      filePath: "/p/.claude/settings.local.json",
      state: state("BLOCKED"),
      kind: "allow",
    },
    {
      name: "code in IDLE",
      filePath: "src/a.ts",
      state: state("IDLE"),
      kind: "allow",
    },
    {
      name: "code in COMPLETED",
      filePath: "src/a.ts",
      state: state("COMPLETED"),
      kind: "allow",
    },
    {
      name: "code in EXECUTING",
      filePath: "src/a.ts",
      state: state("EXECUTING"),
      kind: "execute",
    },
  ];

  for (const c of allowed) {
    bdd.it(`allows ${c.name}`, () => {
      assert.assertEquals(
        hookDecisions.fileEditVerdict(c.filePath, c.state, prefix),
        { kind: c.kind },
      );
    });
  }

  const denied: readonly {
    readonly name: string;
    readonly state: hookDecisions.GateState;
    readonly names: string;
  }[] = [
    {
      name: "with no phase",
      state: state(null),
      names: `${prefix} status`,
    },
    {
      name: "in the review gate",
      state: state("EXECUTING", "upload", "review-gate"),
      names: `${prefix} spec upload next --answer=`,
    },
    {
      name: "in DISCOVERY",
      state: state("DISCOVERY"),
      names: `${prefix} spec upload next\``,
    },
    {
      name: "in DISCOVERY_REFINEMENT",
      state: state("DISCOVERY_REFINEMENT"),
      names: `${prefix} spec upload next --answer="approve"`,
    },
    {
      name: "in SPEC_PROPOSAL",
      state: state("SPEC_PROPOSAL"),
      names: `${prefix} spec upload approve`,
    },
    {
      name: "in SPEC_APPROVED",
      state: state("SPEC_APPROVED"),
      names: `${prefix} spec upload next --answer="start"`,
    },
    {
      name: "in BLOCKED",
      state: state("BLOCKED"),
      names: `${prefix} spec upload next --answer="resolution"`,
    },
    {
      name: "in DISCOVERY with no spec, as a session state",
      state: state("DISCOVERY", null),
      names: `${prefix} next\``,
    },
    {
      name: "in a phase it does not know",
      state: state("SOMETHING_NEW"),
      names: `${prefix} spec upload next\` first.`,
    },
  ];

  for (const c of denied) {
    bdd.it(`denies code edits ${c.name}, naming the command to run`, () => {
      const verdict = hookDecisions.fileEditVerdict(
        "src/a.ts",
        c.state,
        prefix,
      );

      assert.assertEquals(verdict.kind, "deny");
      const reason = verdict.kind === "deny" ? verdict.reason : "";
      assert.assertStringIncludes(reason, c.names);
      assert.assertEquals(reason.includes("—"), false, reason);
    });
  }

  bdd.it(
    "adds the phase's mode directive to a conversation-phase denial",
    () => {
      const verdict = hookDecisions.fileEditVerdict(
        "src/a.ts",
        state("DISCOVERY"),
        prefix,
      );

      assert.assertEquals(verdict.kind, "deny");
      assert.assertStringIncludes(
        verdict.kind === "deny" ? verdict.reason : "",
        "modeDirective: Ensure you are in plan mode.",
      );
    },
  );
});

// =============================================================================
// PostToolUse and Stop filters
// =============================================================================

bdd.describe("isLoggedFileWrite", () => {
  const cases = [
    { filePath: "/src/upload.ts", expected: true },
    { filePath: "/project/.eser/rules/test.md", expected: false },
    { filePath: "/project/.claude/hooks/test.js", expected: false },
    { filePath: "", expected: false },
  ];

  for (const { filePath, expected } of cases) {
    bdd.it(`${expected ? "logs" : "skips"} "${filePath}"`, () => {
      assert.assertEquals(hookDecisions.isLoggedFileWrite(filePath), expected);
    });
  }
});

bdd.describe("stopRecordsIteration", () => {
  bdd.it("records an iteration in EXECUTING", () => {
    assert.assertEquals(
      hookDecisions.stopRecordsIteration({}, "EXECUTING"),
      true,
    );
  });

  bdd.it("does not act outside EXECUTING", () => {
    assert.assertEquals(
      hookDecisions.stopRecordsIteration({}, "DISCOVERY"),
      false,
    );
  });

  bdd.it(
    "does not act on a stop the Stop hook caused, which would loop",
    () => {
      assert.assertEquals(
        hookDecisions.stopRecordsIteration(
          { stop_hook_active: true },
          "EXECUTING",
        ),
        false,
      );
    },
  );
});

// =============================================================================
// SessionStart output
// =============================================================================

bdd.describe("sessionStartOutput", () => {
  const compiled = { phase: "IDLE", instruction: "Run `x spec new`." };

  bdd.it("puts the compiled output in additionalContext", () => {
    const output = hookDecisions.sessionStartOutput(compiled) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    assert.assertEquals(
      output.hookSpecificOutput.hookEventName,
      "SessionStart",
    );
    assert.assertStringIncludes(
      output.hookSpecificOutput.additionalContext,
      JSON.stringify(compiled),
    );
  });

  bdd.it(
    "leaves no compiled field at the top level, where Claude Code drops it",
    () => {
      assert.assertEquals(
        Object.keys(hookDecisions.sessionStartOutput(compiled)),
        ["hookSpecificOutput"],
      );
    },
  );

  bdd.it("gives Copilot CLI a top-level additionalContext", () => {
    const output = hookDecisions.sessionStartOutput(compiled, "copilot");

    assert.assertEquals(Object.keys(output), ["additionalContext"]);
    assert.assertStringIncludes(
      String(output["additionalContext"]),
      JSON.stringify(compiled),
    );
  });
});

// =============================================================================
// AskUserQuestion step
// =============================================================================

bdd.describe("askedQuestionsOf", () => {
  const cases: readonly {
    readonly name: string;
    readonly toolInput: Record<string, unknown>;
    readonly expected: readonly string[];
  }[] = [
    {
      name: "every entry of questions",
      toolInput: { questions: [{ question: "First" }, { question: "Second" }] },
      expected: ["First", "Second"],
    },
    {
      name: "the older single question field",
      toolInput: { question: "Legacy" },
      expected: ["Legacy"],
    },
    {
      name: "nothing for entries with no text",
      toolInput: { questions: [{}], question: "ignored" },
      expected: [],
    },
    { name: "nothing for an empty input", toolInput: {}, expected: [] },
  ];

  for (const { name, toolInput, expected } of cases) {
    bdd.it(`reads ${name}`, () => {
      assert.assertEquals(hookDecisions.askedQuestionsOf(toolInput), expected);
    });
  }
});

bdd.describe("askStepOf", () => {
  const cases = [
    { phase: "DISCOVERY", stepId: "discovery" },
    { phase: "DISCOVERY_REFINEMENT", stepId: "refinement" },
    { phase: "SPEC_PROPOSAL", stepId: "approval" },
    { phase: "EXECUTING", stepId: "unknown" },
  ];

  for (const { phase, stepId } of cases) {
    bdd.it(`names the ${stepId} step in ${phase}`, () => {
      assert.assertEquals(hookDecisions.askStepOf(phase), stepId);
    });
  }
});

bdd.describe("discoveryAskSteps", () => {
  const [statusQuo, ambition, reversibility] = questions.QUESTIONS;

  bdd.it("ties each asked question to the open question it matches", () => {
    const steps = hookDecisions.discoveryAskSteps(
      [statusQuo!, ambition!, reversibility!],
      [
        "Describe the 1-star and 10-star versions.",
        "What does the user do today without this feature?",
      ],
    );

    assert.assertEquals(
      steps.map((s) => [s.stepId, s.match]),
      [
        ["ambition", "exact"],
        ["status_quo", "exact"],
      ],
    );
  });

  bdd.it("gives a rephrased question the first open one left", () => {
    const steps = hookDecisions.discoveryAskSteps(
      [statusQuo!, ambition!],
      ["Which upload tool do your customers use now?", "Anything else?"],
    );

    assert.assertEquals(
      steps.map((s) => [s.stepId, s.match]),
      [
        ["status_quo", "modified"],
        ["ambition", "modified"],
      ],
    );
  });

  bdd.it("records no more steps than open questions", () => {
    const steps = hookDecisions.discoveryAskSteps(
      [statusQuo!],
      ["First?", "Second?"],
    );

    assert.assertEquals(
      steps.map((s) => s.stepId),
      ["status_quo"],
    );
  });
});

bdd.describe("askTokenStepsAfter", () => {
  const atQuestions = (answered: readonly string[] = []): schema.StateFile => {
    let state = machine.startSpec(
      schema.createInitialState(),
      "test-spec",
      "spec/test-spec",
    );
    for (const id of answered) {
      state = machine.addDiscoveryAnswer(state, id, `Answer for ${id} in full`);
    }
    return state;
  };

  const baseTexts = questions.QUESTIONS.map((q) => q.text);

  bdd.it("records the first call of a set of base questions", () => {
    const steps = hookDecisions.askTokenStepsAfter(
      atQuestions(),
      [],
      baseTexts.slice(0, 4),
    );

    assert.assertEquals(
      steps?.map((s) => s.stepId),
      ["status_quo", "ambition", "reversibility", "user_impact"],
    );
  });

  bdd.it("adds the second call to the steps the first recorded", () => {
    const first = hookDecisions.askTokenStepsAfter(
      atQuestions(),
      [],
      baseTexts.slice(0, 4),
    )!;
    // The second call asks the last two, rephrased beyond recognition.
    const steps = hookDecisions.askTokenStepsAfter(atQuestions(), first, [
      "How will you know it works?",
      "Where does it stop?",
    ]);

    assert.assertEquals(
      steps?.map((s) => s.stepId),
      [...questions.QUESTIONS.map((q) => q.id)],
    );
  });

  bdd.it("skips the questions already answered", () => {
    const steps = hookDecisions.askTokenStepsAfter(
      atQuestions(["status_quo", "ambition"]),
      [],
      ["Is there an irreversible decision?"],
    );

    assert.assertEquals(
      steps?.map((s) => s.stepId),
      ["reversibility"],
    );
  });

  bdd.it("keeps the token when the call asks no open base question", () => {
    const answered = questions.QUESTIONS.slice(0, 5).map((q) => q.id);
    const prior = [{ stepId: "scope_boundary", match: "exact" as const }];

    assert.assertEquals(
      hookDecisions.askTokenStepsAfter(atQuestions(answered), prior, [
        "Add, defer or skip the offline mode?",
      ]),
      null,
    );
  });

  bdd.it("records a follow-up under the discovery step", () => {
    const answered = questions.QUESTIONS.map((q) => q.id);

    assert.assertEquals(
      hookDecisions
        .askTokenStepsAfter(
          atQuestions(answered),
          [],
          ["What is the rollback plan?"],
        )
        ?.map((s) => s.stepId),
      ["discovery"],
    );
  });

  bdd.it("records a premise question under the discovery step", () => {
    const state = atQuestions();
    const premises: schema.StateFile = {
      ...state,
      specDescription: "Add photo upload",
      discovery: { ...state.discovery, mode: "full" },
    };

    assert.assertEquals(
      hookDecisions
        .askTokenStepsAfter(
          premises,
          [],
          ["Do you agree that users need uploads?"],
        )
        ?.map((s) => s.stepId),
      ["discovery"],
    );
  });

  bdd.it("records the review steps outside DISCOVERY", () => {
    const state: schema.StateFile = {
      ...atQuestions(),
      phase: "SPEC_PROPOSAL",
    };

    assert.assertEquals(
      hookDecisions.askTokenStepsAfter(state, [], ["Approve?"]),
      [
        {
          stepId: "approval",
          match: "modified",
          originalQuestion: "",
          askedQuestion: "Approve?",
        },
      ],
    );
  });

  bdd.it("records the unknown step without a readable state", () => {
    assert.assertEquals(
      hookDecisions
        .askTokenStepsAfter(null, [], ["Anything?"])
        ?.map((s) => s.stepId),
      ["unknown"],
    );
  });
});

bdd.describe("askMatch", () => {
  bdd.it("is exact when the agent asked the question as written", () => {
    assert.assertEquals(
      hookDecisions.askMatch(
        "What does the user do today without this feature?",
        "What does the user do today without this feature?",
      ),
      "exact",
    );
  });

  bdd.it("is modified when the agent rephrased it", () => {
    assert.assertEquals(
      hookDecisions.askMatch(
        "What does the user do today without this feature?",
        "Which upload tool do your customers use now?",
      ),
      "modified",
    );
  });

  bdd.it("is modified when the step has no expected question", () => {
    assert.assertEquals(hookDecisions.askMatch("", "Approve?"), "modified");
  });
});
