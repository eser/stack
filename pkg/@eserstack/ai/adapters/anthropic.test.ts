// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as config from "../config.ts";
import * as errors from "../errors.ts";
import type * as generation from "../generation.ts";
import type * as types from "../types.ts";
import * as anthropic from "./anthropic.ts";

// These tests pin TASK-63 against a fake SDK client: a refusal is reported as a
// refusal, and thinking blocks keep their own kind and their signature, so a
// tool-use loop can send them back unchanged. Anthropic rejects an assistant
// turn whose tool calls are not preceded by the thinking that produced them.

type FakeClient = {
  readonly sent: Record<string, unknown>[];
  readonly client: unknown;
};

/** A client whose messages.create returns `reply` and records each request. */
const fakeClient = (reply: unknown): FakeClient => {
  const sent: Record<string, unknown>[] = [];

  return {
    sent,
    client: {
      messages: {
        create: (params: Record<string, unknown>) => {
          sent.push(params);

          return Promise.resolve(reply);
        },
      },
    },
  };
};

const modelWith = (fake: FakeClient): anthropic.AnthropicModel =>
  new anthropic.AnthropicModel(
    fake.client,
    config.withDefaults({ provider: "anthropic", model: "claude-test" }),
  );

const message = (stopReason: string, content: unknown[]) => ({
  content,
  stop_reason: stopReason,
  usage: { input_tokens: 10, output_tokens: 20 },
});

const generate = async (
  fake: FakeClient,
  messages: readonly types.Message[],
): Promise<generation.GenerateTextResult> => {
  const result = await modelWith(fake).generateText({ messages });
  assert.assert(results.isOk(result), "generateText failed");

  return result.value;
};

nodeTest.test(
  "a refusal is reported as a refusal, not as an answer",
  async () => {
    const fake = fakeClient(
      message("refusal", [{ type: "text", text: "I can't help with that." }]),
    );

    const result = await generate(fake, [
      {
        role: "user",
        content: [{ kind: "text", text: "do something declined" }],
      },
    ]);

    assert.assertEquals(result.stopReason, "refusal");
  },
);

// TASK-156: a full context window is a truncation like max_tokens.
for (const [stopReason, want] of [
  ["max_tokens", "max_tokens"],
  ["model_context_window_exceeded", "max_tokens"],
  ["stop_sequence", "stop"],
  ["end_turn", "end_turn"],
] as const) {
  nodeTest.test(`stop_reason ${stopReason} maps to ${want}`, async () => {
    const fake = fakeClient(
      message(stopReason, [{ type: "text", text: "cut sho" }]),
    );

    const result = await generate(fake, [
      {
        role: "user",
        content: [{ kind: "text", text: "write a long story" }],
      },
    ]);

    assert.assertEquals(result.stopReason, want);
  });
}

nodeTest.test("thinking blocks keep their kind and signature", async () => {
  const fake = fakeClient(
    message("tool_use", [
      { type: "thinking", thinking: "Check the weather.", signature: "sig-1" },
      // Claude 5 omits the thinking text by default; the signature still matters.
      { type: "thinking", thinking: "", signature: "sig-2" },
      { type: "redacted_thinking", data: "opaque-data" },
      { type: "text", text: "Looking it up." },
      { type: "tool_use", id: "toolu_1", name: "weather", input: {} },
    ]),
  );

  const result = await generate(fake, [
    {
      role: "user",
      content: [{ kind: "text", text: "weather?" }],
    },
  ]);

  assert.assertEquals(result.content.slice(0, 3), [
    {
      kind: "thinking",
      thinking: { text: "Check the weather.", signature: "sig-1" },
    },
    { kind: "thinking", thinking: { text: "", signature: "sig-2" } },
    { kind: "thinking", thinking: { text: "", redactedData: "opaque-data" } },
  ]);
});

nodeTest.test(
  "thinking blocks are replayed unchanged in the next request",
  async () => {
    const fake = fakeClient(
      message("end_turn", [{ type: "text", text: "ok" }]),
    );

    await generate(fake, [
      { role: "user", content: [{ kind: "text", text: "weather?" }] },
      {
        role: "assistant",
        content: [
          {
            kind: "thinking",
            thinking: { text: "Check the weather.", signature: "sig-1" },
          },
          { kind: "thinking", thinking: { text: "", redactedData: "opaque" } },
          // No signature, as another provider would produce: it cannot pass the
          // API's check, so it must not be sent.
          { kind: "thinking", thinking: { text: "unsigned" } },
          { kind: "thinking", thinking: { text: "empty", signature: "" } },
          {
            kind: "tool_call",
            toolCall: { id: "toolu_1", name: "weather", arguments: {} },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            kind: "tool_result",
            toolResult: {
              toolCallId: "toolu_1",
              content: "sunny",
              isError: false,
            },
          },
        ],
      },
    ]);

    const sentMessages = fake.sent[0]!["messages"] as Array<{
      role: string;
      content: Record<string, unknown>[];
    }>;

    assert.assertEquals(sentMessages[1]!.content, [
      { type: "thinking", thinking: "Check the weather.", signature: "sig-1" },
      { type: "redacted_thinking", data: "opaque" },
      { type: "tool_use", id: "toolu_1", name: "weather", input: {} },
    ]);
  },
);

nodeTest.test(
  "a streamed thinking block arrives whole, before the refusal",
  async () => {
    const events = [
      { type: "message_start", message: { usage: { input_tokens: 10 } } },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "", signature: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "Check " },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "first." },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "signature_delta", signature: "sig-stream" },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "text", text: "" },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "I can't help with that." },
      },
      { type: "content_block_stop", index: 1 },
      {
        type: "message_delta",
        delta: { stop_reason: "refusal" },
        usage: { output_tokens: 12 },
      },
    ];

    async function* stream(): AsyncIterable<unknown> {
      for (const event of events) {
        yield event;
      }
    }

    const fake = fakeClient(stream());
    const collected: generation.StreamEvent[] = [];

    for await (const event of modelWith(fake).streamText({
      messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }],
    })) {
      collected.push(event);
    }

    assert.assertEquals(
      collected.map((event) => event.kind),
      ["thinking", "content_delta", "message_done"],
    );
    assert.assertEquals(collected[0], {
      kind: "thinking",
      thinking: { text: "Check first.", signature: "sig-stream" },
    });

    const done = collected[2];
    assert.assert(done?.kind === "message_done");
    assert.assertEquals(done.stopReason, "refusal");
  },
);

// TASK-56: effort is sent as output_config.effort. Thinking is turned on only
// by a thinking budget; an explicit effort wins over the level the budget maps
// to.
const effortCases: ReadonlyArray<{
  readonly name: string;
  readonly options: Partial<generation.GenerateTextOptions>;
  readonly thinking: unknown;
  readonly outputConfig: unknown;
}> = [
  {
    name: "sends effort as output_config.effort",
    options: { effort: "xhigh" },
    thinking: undefined,
    outputConfig: { effort: "xhigh" },
  },
  {
    name: "an explicit effort wins over the budget's level",
    options: { effort: "max", thinkingBudget: 500 },
    thinking: { type: "adaptive" },
    outputConfig: { effort: "max" },
  },
  {
    name: "a thinking budget alone maps to an effort level",
    options: { thinkingBudget: 20_000 },
    thinking: { type: "adaptive" },
    outputConfig: { effort: "high" },
  },
  {
    name: "sends no effort when neither is set",
    options: {},
    thinking: undefined,
    outputConfig: undefined,
  },
];

for (const tc of effortCases) {
  nodeTest.test(`effort: ${tc.name}`, async () => {
    const fake = fakeClient(
      message("end_turn", [{ type: "text", text: "ok" }]),
    );

    const result = await modelWith(fake).generateText({
      messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }],
      ...tc.options,
    });

    assert.assert(results.isOk(result), "generateText failed");
    assert.assertEquals(fake.sent[0]!["thinking"], tc.thinking);
    assert.assertEquals(fake.sent[0]!["output_config"], tc.outputConfig);
  });
}

// TASK-57: a json_schema response format is sent as output_config.format, in
// the same object as the effort. Claude has no JSON mode without a schema, so
// json_object and text send nothing.
const titleSchema: Record<string, unknown> = {
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
  additionalProperties: false,
};

const responseFormatCases: ReadonlyArray<{
  readonly name: string;
  readonly options: Partial<generation.GenerateTextOptions>;
  readonly outputConfig: unknown;
}> = [
  {
    name: "sends a json_schema format as output_config.format, without its name",
    options: {
      responseFormat: {
        type: "json_schema",
        name: "post",
        jsonSchema: titleSchema,
      },
    },
    outputConfig: { format: { type: "json_schema", schema: titleSchema } },
  },
  {
    name: "merges the format with the effort",
    options: {
      responseFormat: { type: "json_schema", jsonSchema: titleSchema },
      effort: "low",
    },
    outputConfig: {
      effort: "low",
      format: { type: "json_schema", schema: titleSchema },
    },
  },
  {
    name: "merges the format with the level a thinking budget maps to",
    options: {
      responseFormat: { type: "json_schema", jsonSchema: titleSchema },
      thinkingBudget: 5_000,
    },
    outputConfig: {
      effort: "medium",
      format: { type: "json_schema", schema: titleSchema },
    },
  },
  {
    name: "sends nothing for json_object",
    options: { responseFormat: { type: "json_object" } },
    outputConfig: undefined,
  },
  {
    name: "keeps only the effort for text",
    options: { responseFormat: { type: "text" }, effort: "high" },
    outputConfig: { effort: "high" },
  },
];

for (const tc of responseFormatCases) {
  nodeTest.test(`responseFormat: ${tc.name}`, async () => {
    const fake = fakeClient(
      message("end_turn", [{ type: "text", text: '{"title":"ok"}' }]),
    );

    const result = await modelWith(fake).generateText({
      messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }],
      ...tc.options,
    });

    assert.assert(results.isOk(result), "generateText failed");
    assert.assertEquals(fake.sent[0]!["output_config"], tc.outputConfig);
  });
}

nodeTest.test(
  "responseFormat: a streamed request carries the format",
  async () => {
    async function* stream(): AsyncIterable<unknown> {
      yield {
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 1 },
      };
    }

    const fake = fakeClient(stream());

    for await (const _event of modelWith(fake).streamText({
      messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }],
      responseFormat: { type: "json_schema", jsonSchema: titleSchema },
    })) {
      // Only the request matters here.
    }

    assert.assertEquals(fake.sent[0]!["stream"], true);
    assert.assertEquals(fake.sent[0]!["output_config"], {
      format: { type: "json_schema", schema: titleSchema },
    });
  },
);

nodeTest.test(
  "responseFormat: a batch request carries the format",
  async () => {
    const sent: Record<string, unknown>[] = [];
    const client = {
      beta: {
        messages: {
          batches: {
            create: (body: Record<string, unknown>) => {
              sent.push(body);

              return Promise.resolve({
                id: "batch_1",
                processing_status: "in_progress",
                created_at: "2026-10-04T00:00:00Z",
                request_counts: { succeeded: 0, errored: 0 },
              });
            },
          },
        },
      },
    };
    const model = new anthropic.AnthropicModel(
      client,
      config.withDefaults({ provider: "anthropic", model: "claude-test" }),
    );

    await model.submitBatch({
      items: [
        {
          customId: "req-1",
          options: {
            messages: [
              { role: "user", content: [{ kind: "text", text: "hi" }] },
            ],
            responseFormat: { type: "json_schema", jsonSchema: titleSchema },
          },
        },
      ],
    });

    const requests = sent[0]!["requests"] as Array<{
      params: Record<string, unknown>;
    }>;
    assert.assertEquals(requests[0]!.params["output_config"], {
      format: { type: "json_schema", schema: titleSchema },
    });
  },
);

nodeTest.test(
  "responseFormat: json_schema without a schema fails before sending",
  async () => {
    const fake = fakeClient(
      message("end_turn", [{ type: "text", text: "ok" }]),
    );
    const options: generation.GenerateTextOptions = {
      messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }],
      responseFormat: { type: "json_schema" },
    };

    const result = await modelWith(fake).generateText(options);

    assert.assert(results.isFail(result), "generateText succeeded");
    assert.assertInstanceOf(result.error, errors.BadRequestError);
    assert.assertStringIncludes(result.error.message, "jsonSchema");

    const streamed: generation.StreamEvent[] = [];
    for await (const event of modelWith(fake).streamText(options)) {
      streamed.push(event);
    }

    assert.assertEquals(streamed.length, 1);
    assert.assertInstanceOf(
      streamed[0]?.kind === "error" ? streamed[0].error : null,
      errors.BadRequestError,
    );
    assert.assertEquals(fake.sent.length, 0);
  },
);
