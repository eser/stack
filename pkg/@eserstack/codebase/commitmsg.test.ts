// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { extractCommitLine } from "./commitmsg.ts";

Deno.test("extractCommitLine returns a clean single conventional line as-is", () => {
  assertEquals(
    extractCommitLine("feat(mux): add terminal multiplexer"),
    "feat(mux): add terminal multiplexer",
  );
});

Deno.test("extractCommitLine pulls the last conforming line out of chatty agent output", () => {
  const chatty =
    "conventional commit message: feat(mux): add frontend-neutral multiplexer\n\n" +
    "That's 71 chars. Let me verify the scope.\n\n" +
    "feat(mux): add terminal multiplexer and agent adapters with native PTY\n\n" +
    "Output only the line.";

  assertEquals(
    extractCommitLine(chatty),
    "feat(mux): add terminal multiplexer and agent adapters with native PTY",
  );
});

Deno.test("extractCommitLine supports scopes, !, and all conventional types", () => {
  assertEquals(extractCommitLine("fix: handle null"), "fix: handle null");
  assertEquals(
    extractCommitLine("refactor(api)!: drop v1"),
    "refactor(api)!: drop v1",
  );
});

Deno.test("extractCommitLine falls back to the first non-empty line when nothing matches", () => {
  assertEquals(
    extractCommitLine("\n  updated the readme  \nsecond line"),
    "updated the readme",
  );
});
