// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { detectStateFromMatchers, type TerminalView } from "./adapter.ts";
import { claudeCodeAdapter } from "./adapters/claude-code.ts";

export const viewOf = (text: string): TerminalView => {
  const lines = text.split("\n");

  return {
    cursorRow: 0,
    cursorCol: 0,
    rows: lines.length,
    cols: 80,
    lineText: (r) => lines[r] ?? "",
    recentOutput: () => text,
  };
};

Deno.test("detectStateFromMatchers applies priority busy > awaiting > prompt", () => {
  const matchers = {
    busy: /BUSY/,
    awaitingInput: /ASK/,
    promptReady: /PROMPT/,
  };

  assertEquals(
    detectStateFromMatchers(viewOf("BUSY ASK PROMPT"), "starting", matchers),
    "busy",
  );
  assertEquals(
    detectStateFromMatchers(viewOf("ASK PROMPT"), "starting", matchers),
    "awaiting-input",
  );
  assertEquals(
    detectStateFromMatchers(viewOf("PROMPT"), "starting", matchers),
    "prompt-ready",
  );
  assertEquals(
    detectStateFromMatchers(viewOf("nothing"), "busy", matchers),
    "busy",
  ); // falls back to prev
});

Deno.test("claudeCodeAdapter classifies common states", () => {
  assertEquals(
    claudeCodeAdapter.detectState(
      viewOf("✻ Forging… (esc to interrupt)"),
      "starting",
    ),
    "busy",
  );
  assertEquals(
    claudeCodeAdapter.detectState(
      viewOf("Do you want to proceed?\n❯ Yes\n  No"),
      "busy",
    ),
    "awaiting-input",
  );
  assertEquals(
    claudeCodeAdapter.detectState(viewOf("│ > "), "busy"),
    "prompt-ready",
  );
  assertEquals(claudeCodeAdapter.submitSequence(), "\r");
  assertEquals(claudeCodeAdapter.capabilities.supportsBracketedPaste, true);
});
