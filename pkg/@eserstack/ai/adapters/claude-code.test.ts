// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { parseJsonResult } from "./claude-code.ts";

const textOf = (
  r: ReturnType<typeof parseJsonResult>,
): string =>
  r.content
    .filter((b): b is { kind: "text"; text: string } => b.kind === "text")
    .map((b) => b.text)
    .join("");

Deno.test("parseJsonResult extracts the result from a single result object", () => {
  const raw = JSON.stringify({
    type: "result",
    subtype: "success",
    result: "feat(ai): add provider",
    usage: { input_tokens: 10, output_tokens: 5 },
  });

  const r = parseJsonResult(raw, "claude-opus");
  assertEquals(textOf(r), "feat(ai): add provider");
  assertEquals(r.usage.inputTokens, 10);
});

Deno.test("parseJsonResult reduces the Claude Code v2 event ARRAY to its result", () => {
  // Claude Code CLI v2 `--output-format json` returns an array of events; the
  // final {type:"result"} holds the answer. Must not stringify the whole array.
  const raw = JSON.stringify([
    { type: "system", subtype: "init", session_id: "abc" },
    { type: "rate_limit_event", rate_limit_info: { status: "allowed" } },
    {
      type: "assistant",
      message: { content: [{ type: "text", text: "feat(x): wip" }] },
    },
    {
      type: "result",
      subtype: "success",
      result: "feat(mux): add terminal multiplexer",
      usage: { input_tokens: 100, output_tokens: 20 },
    },
  ]);

  const r = parseJsonResult(raw, "claude-opus");
  assertEquals(textOf(r), "feat(mux): add terminal multiplexer");
  assertEquals(textOf(r).startsWith("["), false); // not the raw transcript
  assertEquals(r.usage.outputTokens, 20);
});

Deno.test("parseJsonResult falls back to the last assistant message when no result event", () => {
  const raw = JSON.stringify([
    { type: "system", subtype: "init" },
    {
      type: "assistant",
      message: { content: [{ type: "text", text: "fix(core): handle null" }] },
    },
  ]);

  const r = parseJsonResult(raw, "claude-opus");
  assertEquals(textOf(r), "fix(core): handle null");
});

Deno.test("parseJsonResult handles JSONL (one event per line)", () => {
  const raw = [
    JSON.stringify({ type: "system", subtype: "init" }),
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: "docs: tidy",
    }),
  ].join("\n");

  const r = parseJsonResult(raw, "claude-opus");
  assertEquals(textOf(r), "docs: tidy");
});

Deno.test("parseJsonResult treats non-JSON output as plain text", () => {
  const r = parseJsonResult("chore: tidy up\n", "claude-opus");
  assertEquals(textOf(r), "chore: tidy up");
});

Deno.test("parseJsonResult never echoes an unrecognized JSON blob as text", () => {
  // A JSON shape with no result/assistant/message → must NOT dump the raw JSON.
  const r = parseJsonResult(
    JSON.stringify({ foo: "bar", nested: [1, 2] }),
    "m",
  );
  assertEquals(textOf(r), "");
});
