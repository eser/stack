// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import {
  containsGitWriteBypass,
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
