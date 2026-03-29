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

describe("isGitReadOnly", () => {
  it("allows git stash list", () => {
    assertEquals(hookDecisions.isGitReadOnly("git stash list"), true);
  });

  it("allows git stash show", () => {
    assertEquals(hookDecisions.isGitReadOnly("git stash show"), true);
  });

  it("blocks git stash drop", () => {
    assertEquals(hookDecisions.isGitReadOnly("git stash drop"), false);
  });

  it("blocks git stash pop", () => {
    assertEquals(hookDecisions.isGitReadOnly("git stash pop"), false);
  });

  it("blocks bare git stash (push implied)", () => {
    assertEquals(hookDecisions.isGitReadOnly("git stash"), false);
  });

  it("allows git tag -l", () => {
    assertEquals(hookDecisions.isGitReadOnly("git tag -l"), true);
  });

  it("allows git tag --list", () => {
    assertEquals(hookDecisions.isGitReadOnly("git tag --list"), true);
  });

  it("blocks git tag v1.0", () => {
    assertEquals(hookDecisions.isGitReadOnly("git tag v1.0"), false);
  });

  it("allows git branch --list", () => {
    assertEquals(hookDecisions.isGitReadOnly("git branch --list"), true);
  });

  it("allows git branch -a", () => {
    assertEquals(hookDecisions.isGitReadOnly("git branch -a"), true);
  });

  it("blocks git branch -D main", () => {
    assertEquals(hookDecisions.isGitReadOnly("git branch -D main"), false);
  });

  it("returns false for non-matching prefix", () => {
    assertEquals(hookDecisions.isGitReadOnly("git commit -m foo"), false);
  });

  it("handles leading whitespace", () => {
    assertEquals(hookDecisions.isGitReadOnly("  git stash list"), true);
  });
});
