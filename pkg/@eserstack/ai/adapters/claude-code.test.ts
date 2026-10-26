// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as config from "../config.ts";
import * as errors from "../errors.ts";
import type * as generation from "../generation.ts";
import * as claudeCode from "./claude-code.ts";

const textOf = (r: ReturnType<typeof claudeCode.parseJsonResult>): string =>
  r.content
    .filter((b): b is { kind: "text"; text: string } => b.kind === "text")
    .map((b) => b.text)
    .join("");

nodeTest.test(
  "parseJsonResult extracts the result from a single result object",
  () => {
    const raw = JSON.stringify({
      type: "result",
      subtype: "success",
      result: "feat(ai): add provider",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const r = claudeCode.parseJsonResult(raw, "claude-opus");
    assert.assertEquals(textOf(r), "feat(ai): add provider");
    assert.assertEquals(r.usage.inputTokens, 10);
  },
);

nodeTest.test(
  "parseJsonResult reduces the Claude Code v2 event ARRAY to its result",
  () => {
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

    const r = claudeCode.parseJsonResult(raw, "claude-opus");
    assert.assertEquals(textOf(r), "feat(mux): add terminal multiplexer");
    assert.assertEquals(textOf(r).startsWith("["), false); // not the raw transcript
    assert.assertEquals(r.usage.outputTokens, 20);
  },
);

nodeTest.test(
  "parseJsonResult falls back to the last assistant message when no result event",
  () => {
    const raw = JSON.stringify([
      { type: "system", subtype: "init" },
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "fix(core): handle null" }],
        },
      },
    ]);

    const r = claudeCode.parseJsonResult(raw, "claude-opus");
    assert.assertEquals(textOf(r), "fix(core): handle null");
  },
);

nodeTest.test("parseJsonResult handles JSONL (one event per line)", () => {
  const raw = [
    JSON.stringify({ type: "system", subtype: "init" }),
    JSON.stringify({
      type: "result",
      subtype: "success",
      result: "docs: tidy",
    }),
  ].join("\n");

  const r = claudeCode.parseJsonResult(raw, "claude-opus");
  assert.assertEquals(textOf(r), "docs: tidy");
});

nodeTest.test("parseJsonResult treats non-JSON output as plain text", () => {
  const r = claudeCode.parseJsonResult("chore: tidy up\n", "claude-opus");
  assert.assertEquals(textOf(r), "chore: tidy up");
});

nodeTest.test(
  "parseJsonResult never echoes an unrecognized JSON blob as text",
  () => {
    // A JSON shape with no result/assistant/message → must NOT dump the raw JSON.
    const r = claudeCode.parseJsonResult(
      JSON.stringify({ foo: "bar", nested: [1, 2] }),
      "m",
    );
    assert.assertEquals(textOf(r), "");
  },
);

nodeTest.test("parseJsonResult reports a declined request as a refusal", () => {
  const raw = JSON.stringify([
    { type: "system", subtype: "init" },
    {
      type: "result",
      subtype: "success",
      result: "I can't help with that.",
      stop_reason: "refusal",
    },
  ]);

  const r = claudeCode.parseJsonResult(raw, "claude-opus");
  assert.assertEquals(r.stopReason, "refusal");
});

// TASK-56: the CLI takes the effort level as --effort.
const claudeConfig = config.withDefaults({
  provider: "claude-code",
  model: "",
});
const hi = [
  {
    role: "user" as const,
    content: [{ kind: "text" as const, text: "hi" }],
  },
];

nodeTest.test("buildArgs sends the effort level as --effort", () => {
  const args = claudeCode.buildArgs(
    claudeConfig,
    { messages: hi, effort: "low" },
    "json",
  );

  assert.assertEquals(args.slice(-2), ["--effort", "low"]);
});

nodeTest.test("buildArgs leaves out --effort when no level is set", () => {
  const args = claudeCode.buildArgs(claudeConfig, { messages: hi }, "json");

  assert.assertFalse(args.includes("--effort"));
});

// TASK-158: a json_schema response format reaches the CLI as --json-schema,
// and the reply is the result event's structured_output. The CLI has no JSON
// mode without a schema, so json_object and text send nothing.
const titleSchema: Record<string, unknown> = {
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
  additionalProperties: false,
};

const jsonSchemaCases: ReadonlyArray<{
  readonly name: string;
  readonly responseFormat: generation.ResponseFormat | undefined;
  readonly schemaArg: string | undefined;
}> = [
  {
    name: "sends a json_schema format's schema as --json-schema",
    responseFormat: {
      type: "json_schema",
      name: "post",
      jsonSchema: titleSchema,
    },
    schemaArg: JSON.stringify(titleSchema),
  },
  {
    name: "sends nothing for json_object",
    responseFormat: { type: "json_object" },
    schemaArg: undefined,
  },
  {
    name: "sends nothing for text",
    responseFormat: { type: "text" },
    schemaArg: undefined,
  },
  {
    name: "sends nothing without a response format",
    responseFormat: undefined,
    schemaArg: undefined,
  },
];

for (const tc of jsonSchemaCases) {
  nodeTest.test(`buildArgs ${tc.name}`, () => {
    const args = claudeCode.buildArgs(
      claudeConfig,
      { messages: hi, responseFormat: tc.responseFormat },
      "json",
    );

    const flag = args.indexOf("--json-schema");
    assert.assertEquals(flag === -1 ? undefined : args[flag + 1], tc.schemaArg);
  });
}

nodeTest.test("buildArgs rejects a json_schema format without a schema", () => {
  assert.assertThrows(
    () =>
      claudeCode.buildArgs(
        claudeConfig,
        { messages: hi, responseFormat: { type: "json_schema" } },
        "json",
      ),
    errors.BadRequestError,
    "has no jsonSchema",
  );
});

nodeTest.test(
  "a json_schema format without a schema fails before the CLI starts",
  async () => {
    // The binary does not exist, so a spawn would fail with another error.
    const model = new claudeCode.ClaudeCodeModel(
      "/nonexistent/claude",
      claudeConfig,
    );
    const options = {
      messages: hi,
      responseFormat: { type: "json_schema" as const },
    };

    const result = await model.generateText(options);
    assert.assert(results.isFail(result), "generateText succeeded");
    assert.assertInstanceOf(result.error, errors.BadRequestError);

    const events: generation.StreamEvent[] = [];
    for await (const event of model.streamText(options)) {
      events.push(event);
    }

    assert.assertEquals(events.length, 1);
    assert.assert(events[0]?.kind === "error");
    assert.assertInstanceOf(events[0].error, errors.BadRequestError);
  },
);

nodeTest.test(
  "parseJsonResult takes the structured_output as the reply",
  () => {
    const raw = JSON.stringify([
      { type: "system", subtype: "init" },
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Here is the title." },
            {
              type: "tool_use",
              id: "call_1",
              name: "StructuredOutput",
              input: { title: "pnpm workspaces" },
            },
          ],
        },
      },
      {
        type: "result",
        subtype: "success",
        result: "Here is the title.",
        structured_output: { title: "pnpm workspaces" },
      },
    ]);

    const r = claudeCode.parseJsonResult(raw, "claude-opus");
    assert.assertEquals(JSON.parse(textOf(r)), { title: "pnpm workspaces" });
    assert.assertEquals(r.content.length, 1);
  },
);

nodeTest.test(
  "parseJsonResult keeps the text when no structured_output came",
  () => {
    const raw = JSON.stringify({
      type: "result",
      subtype: "error_max_structured_output_retries",
      result: "I can't name this post.",
    });

    const r = claudeCode.parseJsonResult(raw, "claude-opus");
    assert.assertEquals(textOf(r), "I can't name this post.");
  },
);
