// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import {
  containsGitWriteBypass,
  extractGitInvocations,
  hasGitWrite,
  isGitAllowed,
  stripFlagValues,
} from "./git.ts";

Deno.test("isGitAllowed permits read-only git", () => {
  assertEquals(isGitAllowed("git log --oneline"), true);
  assertEquals(isGitAllowed("git status"), true);
  assertEquals(isGitAllowed("git -C /repo diff"), true);
  assertEquals(isGitAllowed("git branch --show-current"), true);
  assertEquals(isGitAllowed("ls -la"), true); // not git at all
});

Deno.test("isGitAllowed blocks writes", () => {
  assertEquals(isGitAllowed("git push origin main"), false);
  assertEquals(isGitAllowed("git commit -m x"), false);
  assertEquals(isGitAllowed("git branch -d feature"), false);
  assertEquals(isGitAllowed("git stash"), false); // bare stash = push
  assertEquals(isGitAllowed("git reset --hard"), false);
});

Deno.test("containsGitWriteBypass catches subshell/pipe smuggling", () => {
  assertEquals(containsGitWriteBypass(`bash -c "git push"`), true);
  assertEquals(containsGitWriteBypass("echo x | git commit -F -"), true);
  assertEquals(containsGitWriteBypass("foo && $(git reset --hard)"), true);
  assertEquals(containsGitWriteBypass(`bash -c "git status"`), false);
});

Deno.test("hasGitWrite combines direct + bypass + flag stripping", () => {
  assertEquals(hasGitWrite("git commit -m x && git push"), true);
  assertEquals(hasGitWrite("git log && git diff"), false);
  // user text in a flag value must not be scanned as a command
  assertEquals(
    hasGitWrite(`noskills next --answer="use git push workflow"`),
    false,
  );
});

Deno.test("path-prefixed git is detected as a write (no bypass)", () => {
  assertEquals(isGitAllowed("/usr/bin/git push"), false);
  assertEquals(hasGitWrite("/usr/bin/git push"), true);
  assertEquals(hasGitWrite("./git commit -m x"), true);
  assertEquals(hasGitWrite("echo x | /usr/bin/git push"), true);
});

Deno.test("exotic subshell forms are detected", () => {
  assertEquals(hasGitWrite(`bash -lc "git push"`), true);
  assertEquals(hasGitWrite(`zsh -c "git push"`), true);
  assertEquals(hasGitWrite(`bash -c $'git push'`), true);
});

Deno.test("git look-alike tools are NOT treated as git", () => {
  assertEquals(isGitAllowed("github-cli pr create"), true);
  assertEquals(isGitAllowed("git-lfs ls-files"), true);
  assertEquals(hasGitWrite("gitleaks detect"), false);
  // a path-prefixed read is still allowed
  assertEquals(isGitAllowed("/usr/bin/git status"), true);
});

Deno.test("stripFlagValues removes quoted flag values", () => {
  assertEquals(
    stripFlagValues(`x --answer="git push" --y=z`).includes("push"),
    false,
  );
});

Deno.test("command separators split identically however they are padded", () => {
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
    assertEquals(hasGitWrite(command), write, command);
  }
});

Deno.test("pipe segmentation is insensitive to surrounding whitespace", () => {
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
    assertEquals(containsGitWriteBypass(command), write, command);
    assertEquals(hasGitWrite(command), write, command);
  }
});

Deno.test("extractGitInvocations splits chains regardless of padding", () => {
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
    assertEquals([...extractGitInvocations(command)], invocations, command);
  }
});

Deno.test("whitespace padding cannot stall the guard (ReDoS regression)", () => {
  // The separator splits used to pad both sides with `\s*`, which overlapped the
  // `\n` alternative and re-scanned the run from every offset: 80k spaces already
  // cost ~3s, so an oversized tool argument was a denial of service on the
  // driving loop. Both shapes below must stay in the millisecond range.
  const padding = " ".repeat(200_000);
  const read = `git log${padding}x`;
  const write = `git log${padding}| git push`;

  const started = performance.now();
  assertEquals(hasGitWrite(read), false);
  assertEquals(hasGitWrite(write), true);
  const elapsed = performance.now() - started;

  assert(elapsed < 1_000, `guard took ${elapsed.toFixed(0)}ms on padded input`);
});
