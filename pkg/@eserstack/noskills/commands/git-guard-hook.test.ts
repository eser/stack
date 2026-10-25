// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as invokeHook from "./invoke-hook.ts";

Deno.test("hook guard denies shapes that skipped the old substring pre-check", async () => {
  const root = await runtime.fs.makeTempDir();
  try {
    const commands = [
      "GIT push origin main",
      "g''it push origin main",
      "GIT=$(which g?t); $GIT push",
      "echo 'git push origin main' | sh",
    ];
    const verdicts = await Promise.all(
      commands.map((cmd) => invokeHook.checkGitGuard(cmd, false, root)),
    );

    for (const [i, cmd] of commands.entries()) {
      assert.assertNotEquals(verdicts[i], null, cmd);
    }
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

Deno.test("hook guard inspects shell scripts it runs", async () => {
  const root = await runtime.fs.makeTempDir();
  try {
    await runtime.fs.writeTextFile(
      `${root}/run.sh`,
      "#!/bin/sh\ngit push origin main\n",
    );
    await runtime.fs.writeTextFile(
      `${root}/test.sh`,
      "#!/bin/sh\ndeno test\ngit status\n",
    );

    assert.assertNotEquals(
      await invokeHook.checkGitGuard("bash run.sh", false, root),
      null,
    );
    assert.assertEquals(
      await invokeHook.checkGitGuard("bash test.sh", false, root),
      null,
    );

    // Written and run by the same command: content is unknown ahead of time.
    assert.assertNotEquals(
      await invokeHook.checkGitGuard(
        "printf 'g%sit push' '' > r.sh; sh r.sh",
        false,
        root,
      ),
      null,
    );

    // allowGit turns the guard off.
    assert.assertEquals(
      await invokeHook.checkGitGuard("bash run.sh", true, root),
      null,
    );
    assert.assertEquals(
      await invokeHook.checkGitGuard("git status", false, root),
      null,
    );
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

// The PreToolUse git guard as a whole: the allowlist, chains, and git inside
// `sh -c`, `eval`, pipes and `$(…)`. Moved from sync/hooks.test.ts, which used
// to run these cases against its own copy of the hook logic.
const GUARD_CASES: readonly {
  readonly command: string;
  readonly allowGit: boolean;
  readonly allowed: boolean;
}[] = [
  ...[
    "git log --oneline -5",
    "git diff",
    "git status",
    "git show HEAD",
    "git blame file.ts",
    "git branch",
    "git tag",
    "git stash list",
    "git remote -v",
    'bash -c "git log"',
    'bash -c "git status"',
    'bash -c "ls -la"',
  ].map((command) => ({ command, allowGit: false, allowed: true })),
  ...[
    "git branch -d feature",
    "git branch -D feature",
    "git branch new-branch",
    "git tag v1.0",
    "git tag -d v1.0",
    "git stash",
    "git stash pop",
    "git remote add origin url",
    'git commit -m "test"',
    "git push",
    "git checkout branch",
    "git add .",
    "git merge main",
    "git rebase main",
    "git cherry-pick abc",
    "git reset --hard",
    "git clean -fd",
    "git rm file.ts",
    "git mv a.ts b.ts",
    "echo done && git push",
    'bash -c "git commit -m test"',
    'sh -c "git push"',
    '/bin/bash -c "git add ."',
    'bash -c "echo hello && git commit -m x"',
    'eval "git commit"',
    "echo msg | git commit --file=-",
    "$(git push)",
  ].map((command) => ({ command, allowGit: false, allowed: false })),
  ...['git commit -m "test"', "git push", "git checkout branch"].map(
    (command) => ({ command, allowGit: true, allowed: true }),
  ),
];

Deno.test("hook guard allows git reads and refuses git writes", async () => {
  const root = await runtime.fs.makeTempDir();
  try {
    const verdicts = await Promise.all(
      GUARD_CASES.map(({ command, allowGit }) =>
        invokeHook.checkGitGuard(command, allowGit, root),
      ),
    );

    for (const [i, { command, allowGit, allowed }] of GUARD_CASES.entries()) {
      assert.assertEquals(
        verdicts[i] === null,
        allowed,
        `${command} (allowGit: ${allowGit})`,
      );
    }
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});
