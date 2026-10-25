// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as git from "./git.ts";

nodeTest.test("isGitAllowed permits read-only git", () => {
  assert.assertEquals(git.isGitAllowed("git log --oneline"), true);
  assert.assertEquals(git.isGitAllowed("git status"), true);
  assert.assertEquals(git.isGitAllowed("git -C /repo diff"), true);
  assert.assertEquals(git.isGitAllowed("git branch --show-current"), true);
  assert.assertEquals(git.isGitAllowed("ls -la"), true); // not git at all
});

nodeTest.test("isGitAllowed blocks writes", () => {
  assert.assertEquals(git.isGitAllowed("git push origin main"), false);
  assert.assertEquals(git.isGitAllowed("git commit -m x"), false);
  assert.assertEquals(git.isGitAllowed("git branch -d feature"), false);
  assert.assertEquals(git.isGitAllowed("git stash"), false); // bare stash = push
  assert.assertEquals(git.isGitAllowed("git reset --hard"), false);
});

nodeTest.test("containsGitWriteBypass catches subshell/pipe smuggling", () => {
  assert.assertEquals(git.containsGitWriteBypass(`bash -c "git push"`), true);
  assert.assertEquals(
    git.containsGitWriteBypass("echo x | git commit -F -"),
    true,
  );
  assert.assertEquals(
    git.containsGitWriteBypass("foo && $(git reset --hard)"),
    true,
  );
  assert.assertEquals(
    git.containsGitWriteBypass(`bash -c "git status"`),
    false,
  );
});

nodeTest.test("hasGitWrite combines direct + bypass + flag stripping", () => {
  assert.assertEquals(git.hasGitWrite("git commit -m x && git push"), true);
  assert.assertEquals(git.hasGitWrite("git log && git diff"), false);
  // user text in a flag value must not be scanned as a command
  assert.assertEquals(
    git.hasGitWrite(`noskills next --answer="use git push workflow"`),
    false,
  );
});

nodeTest.test("path-prefixed git is detected as a write (no bypass)", () => {
  assert.assertEquals(git.isGitAllowed("/usr/bin/git push"), false);
  assert.assertEquals(git.hasGitWrite("/usr/bin/git push"), true);
  assert.assertEquals(git.hasGitWrite("./git commit -m x"), true);
  assert.assertEquals(git.hasGitWrite("echo x | /usr/bin/git push"), true);
});

nodeTest.test("exotic subshell forms are detected", () => {
  assert.assertEquals(git.hasGitWrite(`bash -lc "git push"`), true);
  assert.assertEquals(git.hasGitWrite(`zsh -c "git push"`), true);
  assert.assertEquals(git.hasGitWrite(`bash -c $'git push'`), true);
});

nodeTest.test("git look-alike tools are NOT treated as git", () => {
  assert.assertEquals(git.isGitAllowed("github-cli pr create"), true);
  assert.assertEquals(git.isGitAllowed("git-lfs ls-files"), true);
  assert.assertEquals(git.hasGitWrite("gitleaks detect"), false);
  // a path-prefixed read is still allowed
  assert.assertEquals(git.isGitAllowed("/usr/bin/git status"), true);
});

nodeTest.test("stripFlagValues removes quoted flag values", () => {
  assert.assertEquals(
    git.stripFlagValues(`x --answer="git push" --y=z`).includes("push"),
    false,
  );
});

nodeTest.test(
  "command separators split identically however they are padded",
  () => {
    const cases: readonly [command: string, write: boolean][] = [
      ["git log && git push", true],
      ["git log&&git push", true],
      ["git log   &&   git push", true],
      ["git log &&\n git push", true],
      ["git log || git push", true],
      ["git log ;\tgit push", true],
      ["git log ; ; git push", true],
      ["git log\ngit push", true],
      ["git log\n\n\n  git push", true],
      ["git log \n \n git push", true],
      ["git log && git diff", false],
      ["git log\n\n git status", false],
      ["  git log  \n  git diff  ", false],
      ["git log ; ; git status", false],
    ];

    for (const [command, write] of cases) {
      assert.assertEquals(git.hasGitWrite(command), write, command);
    }
  },
);

nodeTest.test(
  "pipe segmentation is insensitive to surrounding whitespace",
  () => {
    const cases: readonly [command: string, write: boolean][] = [
      ["echo x | git commit -F -", true],
      ["echo x|git commit -F -", true],
      ["echo x  |  git commit -F -", true],
      ["echo x | | git commit -F -", true],
      ["| git push", true],
      ["echo x | /usr/bin/git push", true],
      ["git log | cat", false],
      ["git log|cat", false],
      ["git log   |   cat", false],
      ["git log |", false],
      ["cat foo | git log | grep x", false],
    ];

    for (const [command, write] of cases) {
      assert.assertEquals(git.containsGitWriteBypass(command), write, command);
      assert.assertEquals(git.hasGitWrite(command), write, command);
    }
  },
);

nodeTest.test(
  "extractGitInvocations splits chains regardless of padding",
  () => {
    const cases: readonly [command: string, invocations: string[]][] = [
      ["git log && git push", ["git log", "git push"]],
      ["git log&&git push", ["git log", "git push"]],
      ["git log   &&   git push", ["git log", "git push"]],
      ["git log \n \n git push", ["git log", "git push"]],
      ["git log ; ; git push", ["git log", "git push"]],
      ["  git log  \n  git diff  ", ["git log", "git diff"]],
      ["git log | cat", ["git log"]],
      ["", []],
      ["   \n\n   ", []],
    ];

    for (const [command, invocations] of cases) {
      assert.assertEquals(
        [...git.extractGitInvocations(command)],
        invocations,
        command,
      );
    }
  },
);

nodeTest.test(
  "whitespace padding cannot stall the guard (ReDoS regression)",
  () => {
    // The separator splits used to pad both sides with `\s*`, which overlapped the
    // `\n` alternative and re-scanned the run from every offset: 80k spaces already
    // cost ~3s, so an oversized tool argument was a denial of service on the
    // driving loop. Both shapes below must stay in the millisecond range.
    const padding = " ".repeat(200_000);
    const read = `git log${padding}x`;
    const write = `git log${padding}| git push`;

    const started = performance.now();
    assert.assertEquals(git.hasGitWrite(read), false);
    assert.assertEquals(git.hasGitWrite(write), true);
    const elapsed = performance.now() - started;

    assert.assert(
      elapsed < 1_000,
      `guard took ${elapsed.toFixed(0)}ms on padded input`,
    );
  },
);

nodeTest.test(
  "isGitArgsAllowed decides on the argument vector git receives",
  () => {
    const cases: readonly [args: readonly string[], allowed: boolean][] = [
      [[], true],
      [["status"], true],
      [["-C", "/repo", "log", "--oneline"], true],
      [["--git-dir=/repo/.git", "diff"], true],
      [["-P", "log"], true],
      [["--no-pager", "-p", "show"], true],
      [["--version"], true],
      [["-v"], true],
      [["--help", "push"], true],
      [["--exec-path"], true],
      [["branch", "--show-current"], true],
      [["config", "--get", "user.name"], true],
      [["commit", "-m", "x"], false],
      [["push", "origin", "main"], false],
      [["--exec-path=/tmp/x", "commit"], false],
      [["-c", "log", "commit"], false],
      [["branch", "-D", "feature"], false],
      [["config", "user.name", "x"], false],
    ];

    for (const [args, allowed] of cases) {
      assert.assertEquals(git.isGitArgsAllowed(args), allowed, args.join(" "));
    }
  },
);

nodeTest.test(
  "isGitAllowed reads informational options and pager flags",
  () => {
    assert.assertEquals(git.isGitAllowed("git --version"), true);
    assert.assertEquals(git.isGitAllowed("git -P log"), true);
    assert.assertEquals(git.isGitAllowed("git --exec-path=/x commit"), false);
  },
);

nodeTest.test(
  "splitGitArgs separates global options from the subcommand",
  () => {
    assert.assertEquals(
      git.splitGitArgs(["-C", "/repo", "--git-dir=/g", "commit", "-m", "x"]),
      {
        globalOptions: ["-C", "/repo", "--git-dir=/g"],
        subcommand: "commit",
        subcommandArgs: ["-m", "x"],
      },
    );
    assert.assertEquals(git.splitGitArgs(["-C", "/repo"]), {
      globalOptions: ["-C", "/repo"],
      subcommand: "",
      subcommandArgs: [],
    });
    // Global options of newer git versions, with and without a value.
    assert.assertEquals(
      git.splitGitArgs([
        "--no-advice",
        "--no-lazy-fetch",
        "--attr-source",
        "HEAD",
        "-C",
        "/repo",
        "commit",
      ]),
      {
        globalOptions: [
          "--no-advice",
          "--no-lazy-fetch",
          "--attr-source",
          "HEAD",
          "-C",
          "/repo",
        ],
        subcommand: "commit",
        subcommandArgs: [],
      },
    );
    assert.assertEquals(
      git.splitGitArgs(["--attr-source=HEAD", "log"]).subcommand,
      "log",
    );
  },
);

nodeTest.test("isGitRemoteWrite flags push however it is introduced", () => {
  assert.assertEquals(git.isGitRemoteWrite(["push"]), true);
  assert.assertEquals(git.isGitRemoteWrite(["-C", "/x", "push", "o"]), true);
  assert.assertEquals(git.isGitRemoteWrite(["send-pack", "r"]), true);
  assert.assertEquals(git.isGitRemoteWrite(["commit"]), false);
  assert.assertEquals(git.isGitRemoteWrite(["log", "push"]), false);
});
