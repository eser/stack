// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as results from "@eserstack/primitives/results";
import * as config from "../config.ts";
import * as generation from "../generation.ts";
import * as openai from "./openai.ts";

// TASK-56: effort is sent as reasoning_effort, as is, and an explicit effort
// wins over the level a thinking budget maps to.

/** A client whose chat.completions.create records each request. */
const fakeClient = (sent: Record<string, unknown>[]): unknown => ({
  chat: {
    completions: {
      create: (params: Record<string, unknown>) => {
        sent.push(params);

        return Promise.resolve({
          choices: [{ message: { content: "ok" }, "finish_reason": "stop" }],
          usage: { "prompt_tokens": 10, "completion_tokens": 5 },
        });
      },
    },
  },
});

const effortCases: ReadonlyArray<{
  readonly name: string;
  readonly options: Partial<generation.GenerateTextOptions>;
  readonly reasoningEffort: unknown;
}> = [
  {
    name: "sends effort as reasoning_effort",
    options: { effort: "low" },
    reasoningEffort: "low",
  },
  {
    name: "passes xhigh through unchanged",
    options: { effort: "xhigh" },
    reasoningEffort: "xhigh",
  },
  {
    name: "an explicit effort wins over the budget's level",
    options: { effort: "medium", thinkingBudget: 20_000 },
    reasoningEffort: "medium",
  },
  {
    name: "a thinking budget alone maps to an effort level",
    options: { thinkingBudget: 500 },
    reasoningEffort: "low",
  },
  {
    name: "sends no reasoning_effort when neither is set",
    options: {},
    reasoningEffort: undefined,
  },
];

for (const tc of effortCases) {
  Deno.test(`effort: ${tc.name}`, async () => {
    const sent: Record<string, unknown>[] = [];
    const model = new openai.OpenAIModel(
      fakeClient(sent),
      config.withDefaults({ provider: "openai", model: "gpt-test" }),
    );

    const result = await model.generateText({
      messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }],
      ...tc.options,
    });

    assert.assert(results.isOk(result), "generateText failed");
    assert.assertEquals(sent[0]!["reasoning_effort"], tc.reasoningEffort);
  });
}

// TASK-156: a filtered or declined answer is a refusal, and a truncated one is
// max_tokens. OpenAI reports a filter as finish_reason content_filter and a
// declined structured output as message.refusal, with finish_reason stop.

/** A client whose chat.completions.create returns `reply`. */
const replyingClient = (reply: unknown): unknown => ({
  chat: {
    completions: { create: () => Promise.resolve(reply) },
  },
});

const modelReplying = (reply: unknown): openai.OpenAIModel =>
  new openai.OpenAIModel(
    replyingClient(reply),
    config.withDefaults({ provider: "openai", model: "gpt-test" }),
  );

const hi = [{
  role: "user" as const,
  content: [{ kind: "text" as const, text: "hi" }],
}];

const resultCases: ReadonlyArray<{
  readonly name: string;
  readonly message: Record<string, unknown>;
  readonly finishReason: string | null;
  readonly stopReason: generation.StopReason;
  readonly text: string;
}> = [
  {
    name: "a content filter is a refusal",
    message: { content: null },
    finishReason: "content_filter",
    stopReason: "refusal",
    text: "",
  },
  {
    name: "a declined structured output is a refusal, with its text",
    message: { content: null, refusal: "I can't help with that." },
    finishReason: "stop",
    stopReason: "refusal",
    text: "I can't help with that.",
  },
  {
    name: "the output limit is max_tokens",
    message: { content: "cut sho" },
    finishReason: "length",
    stopReason: "max_tokens",
    text: "cut sho",
  },
  {
    name: "the deprecated function_call is tool_use",
    message: { content: null },
    finishReason: "function_call",
    stopReason: "tool_use",
    text: "",
  },
  {
    name: "a missing finish reason is end_turn",
    message: { content: "done" },
    finishReason: null,
    stopReason: "end_turn",
    text: "done",
  },
  {
    name: "an unknown finish reason is stop",
    message: { content: "done" },
    finishReason: "something_new",
    stopReason: "stop",
    text: "done",
  },
];

for (const tc of resultCases) {
  Deno.test(`stop reason: ${tc.name}`, async () => {
    const model = modelReplying({
      choices: [{ message: tc.message, "finish_reason": tc.finishReason }],
      usage: { "prompt_tokens": 5, "completion_tokens": 3 },
    });

    const result = await model.generateText({ messages: hi });

    assert.assert(results.isOk(result), "generateText failed");
    assert.assertEquals(result.value.stopReason, tc.stopReason);
    assert.assertEquals(generation.text(result.value), tc.text);
  });
}

const streamCases: ReadonlyArray<{
  readonly name: string;
  readonly deltas: readonly Record<string, unknown>[];
  readonly finishReason: string;
  readonly stopReason: generation.StopReason;
  readonly text: string;
}> = [
  {
    name: "a streamed refusal is a refusal, with its text",
    deltas: [{ refusal: "I can't " }, { refusal: "help with that." }],
    finishReason: "stop",
    stopReason: "refusal",
    text: "I can't help with that.",
  },
  {
    name: "a content filter is a refusal",
    deltas: [{ content: "Partial" }],
    finishReason: "content_filter",
    stopReason: "refusal",
    text: "Partial",
  },
  {
    name: "the output limit is max_tokens",
    deltas: [{ content: "cut sho" }],
    finishReason: "length",
    stopReason: "max_tokens",
    text: "cut sho",
  },
];

for (const tc of streamCases) {
  Deno.test(`stream stop reason: ${tc.name}`, async () => {
    async function* chunks(): AsyncIterable<unknown> {
      for (const [index, delta] of tc.deltas.entries()) {
        const last = index === tc.deltas.length - 1;
        yield {
          choices: [{
            delta,
            "finish_reason": last ? tc.finishReason : null,
          }],
        };
      }
    }

    const collected = await generation.collectStream(
      modelReplying(chunks()).streamText({ messages: hi }),
    );

    assert.assertEquals(collected.stopReason, tc.stopReason);
    assert.assertEquals(generation.text(collected), tc.text);
  });
}
