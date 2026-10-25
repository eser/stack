// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as config from "../config.ts";
import * as errors from "../errors.ts";
import * as generation from "../generation.ts";
import type * as model from "../model.ts";
import * as gemini from "./gemini.ts";
import * as googleShared from "./google-shared.ts";
import * as vertexai from "./vertexai.ts";

// TASK-156: Gemini and Vertex AI report a filtered answer as a finish reason
// such as SAFETY, and a blocked prompt as promptFeedback.blockReason with no
// candidates. Both are a refusal; MAX_TOKENS is max_tokens, and a turn that
// called a tool is tool_use although Gemini ends it with STOP.

const textCandidate = (text: string | null, finishReason?: string) => ({
  ...(text === null ? {} : { content: { role: "model", parts: [{ text }] } }),
  ...(finishReason === undefined ? {} : { finishReason }),
});

const blockedPrompt = { promptFeedback: { blockReason: "SAFETY" } };

const toolCallCandidate = {
  content: {
    role: "model",
    parts: [
      {
        functionCall: { name: "get_weather", args: { city: "Ankara" } },
      },
    ],
  },
  finishReason: "STOP",
};

const resultCases: ReadonlyArray<{
  readonly name: string;
  readonly response: unknown;
  readonly stopReason: generation.StopReason;
}> = [
  {
    name: "a safety filter is a refusal",
    response: { candidates: [textCandidate("Partial", "SAFETY")] },
    stopReason: "refusal",
  },
  {
    name: "prohibited content is a refusal",
    response: { candidates: [textCandidate(null, "PROHIBITED_CONTENT")] },
    stopReason: "refusal",
  },
  {
    name: "a blocklist match is a refusal",
    response: { candidates: [textCandidate(null, "BLOCKLIST")] },
    stopReason: "refusal",
  },
  {
    name: "personal data is a refusal",
    response: { candidates: [textCandidate(null, "SPII")] },
    stopReason: "refusal",
  },
  {
    name: "a recitation is a refusal",
    response: { candidates: [textCandidate("Partial", "RECITATION")] },
    stopReason: "refusal",
  },
  {
    name: "a blocked prompt is a refusal",
    response: blockedPrompt,
    stopReason: "refusal",
  },
  {
    name: "the output limit is max_tokens",
    response: { candidates: [textCandidate("cut sho", "MAX_TOKENS")] },
    stopReason: "max_tokens",
  },
  {
    name: "a turn that called a tool is tool_use",
    response: { candidates: [toolCallCandidate] },
    stopReason: "tool_use",
  },
  {
    name: "a normal answer is end_turn",
    response: { candidates: [textCandidate("done", "STOP")] },
    stopReason: "end_turn",
  },
  {
    name: "a reason with no closer match is stop",
    response: { candidates: [textCandidate("done", "OTHER")] },
    stopReason: "stop",
  },
];

for (const finishReason of [
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
  "IMAGE_RECITATION",
]) {
  Deno.test(`mapGenAIFinishReason: ${finishReason} is a refusal`, () => {
    assert.assertEquals(
      googleShared.mapGenAIFinishReason(finishReason, false),
      "refusal",
    );
  });
}

for (const tc of resultCases) {
  Deno.test(`mapGenAIResponseToResult: ${tc.name}`, () => {
    const result = googleShared.mapGenAIResponseToResult(tc.response, "m");

    assert.assertEquals(result.stopReason, tc.stopReason);
  });
}

async function* chunksOf(chunks: readonly unknown[]): AsyncIterable<unknown> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

const streamCases: ReadonlyArray<{
  readonly name: string;
  readonly chunks: readonly unknown[];
  readonly stopReason: generation.StopReason;
}> = [
  {
    name: "a filter that blocks the rest of the answer is a refusal",
    chunks: [
      { candidates: [textCandidate("Partial")] },
      // The filtered chunk has a finish reason and no content.
      { candidates: [textCandidate(null, "SAFETY")] },
    ],
    stopReason: "refusal",
  },
  {
    name: "a blocked prompt is a refusal",
    chunks: [blockedPrompt],
    stopReason: "refusal",
  },
  {
    name: "the output limit is max_tokens",
    chunks: [{ candidates: [textCandidate("cut sho", "MAX_TOKENS")] }],
    stopReason: "max_tokens",
  },
  {
    name: "a tool call in an earlier chunk makes the turn tool_use",
    chunks: [
      { candidates: [{ content: toolCallCandidate.content }] },
      { candidates: [textCandidate(null, "STOP")] },
    ],
    stopReason: "tool_use",
  },
];

for (const tc of streamCases) {
  Deno.test(`mapGenAIStream: ${tc.name}`, async () => {
    const collected = await generation.collectStream(
      googleShared.mapGenAIStream(chunksOf(tc.chunks)),
    );

    assert.assertEquals(collected.stopReason, tc.stopReason);
  });
}

Deno.test("mapGenAIStream keeps the text and usage of a filtered answer", async () => {
  const collected = await generation.collectStream(
    googleShared.mapGenAIStream(
      chunksOf([
        { candidates: [textCandidate("Partial")] },
        {
          candidates: [textCandidate(null, "SAFETY")],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1 },
        },
      ]),
    ),
  );

  assert.assertEquals(generation.text(collected), "Partial");
  assert.assertEquals(collected.usage, {
    inputTokens: 4,
    outputTokens: 1,
    totalTokens: 5,
  });
});

/** A genai client whose models return `reply` and stream `chunks`. */
const fakeGenAIClient = (reply: unknown, chunks: readonly unknown[]) => ({
  models: {
    generateContent: () => Promise.resolve(reply),
    generateContentStream: () => Promise.resolve(chunksOf(chunks)),
  },
});

const providers = [
  {
    name: "gemini",
    create: (client: unknown) =>
      new gemini.GeminiModel(
        client,
        config.withDefaults({ provider: "gemini", model: "gemini-test" }),
      ),
  },
  {
    name: "vertexai",
    create: (client: unknown) =>
      new vertexai.VertexAIModel(
        client,
        config.withDefaults({ provider: "vertexai", model: "gemini-test" }),
      ),
  },
];

for (const provider of providers) {
  Deno.test(`${provider.name} reports a filtered answer as a refusal`, async () => {
    const filtered = { candidates: [textCandidate("Partial", "SAFETY")] };
    const model = provider.create(fakeGenAIClient(filtered, [filtered]));
    const messages = [
      {
        role: "user" as const,
        content: [{ kind: "text" as const, text: "hi" }],
      },
    ];

    const result = await model.generateText({ messages });
    assert.assert(results.isOk(result), "generateText failed");
    assert.assertEquals(result.value.stopReason, "refusal");

    const streamed = await generation.collectStream(
      model.streamText({ messages }),
    );
    assert.assertEquals(streamed.stopReason, "refusal");
  });
}

/** A genai client that records each request and answers with `reply`. */
const capturingGenAIClient = (
  sent: Record<string, unknown>[],
  reply: unknown,
) => ({
  models: {
    generateContent: (params: Record<string, unknown>) => {
      sent.push(params);

      return Promise.resolve(reply);
    },
    generateContentStream: (params: Record<string, unknown>) => {
      sent.push(params);

      return Promise.resolve(chunksOf([reply]));
    },
  },
});

const doneReply = { candidates: [textCandidate("done", "STOP")] };

/** Runs one generateText, or one streamText collected to its end. */
const generateOrStream = async (
  target: model.LanguageModel,
  options: generation.GenerateTextOptions,
  stream: boolean,
  signal?: AbortSignal,
): Promise<void> => {
  if (!stream) {
    const result = await target.generateText(options, signal);
    assert.assert(results.isOk(result), "generateText failed");

    return;
  }

  await generation.collectStream(target.streamText(options, signal));
};

/** The config of the one request a capturing client recorded. */
const sentConfig = (
  sent: readonly Record<string, unknown>[],
): Record<string, unknown> => {
  assert.assertEquals(sent.length, 1);

  return sent[0]!["config"] as Record<string, unknown>;
};

// TASK-157: gemini and vertexai send the effort level as
// thinkingConfig.thinkingLevel. Gemini's levels stop at HIGH, and the API
// rejects thinkingLevel next to thinkingBudget, so an explicit effort wins and
// the budget is left out.
const effortCases: ReadonlyArray<{
  readonly name: string;
  readonly options: Partial<generation.GenerateTextOptions>;
  readonly thinkingConfig: unknown;
}> = [
  {
    name: "sends low as LOW",
    options: { effort: "low" },
    thinkingConfig: { thinkingLevel: "LOW" },
  },
  {
    name: "sends medium as MEDIUM",
    options: { effort: "medium" },
    thinkingConfig: { thinkingLevel: "MEDIUM" },
  },
  {
    name: "sends high as HIGH",
    options: { effort: "high" },
    thinkingConfig: { thinkingLevel: "HIGH" },
  },
  {
    name: "sends xhigh as HIGH, the highest level",
    options: { effort: "xhigh" },
    thinkingConfig: { thinkingLevel: "HIGH" },
  },
  {
    name: "sends max as HIGH, the highest level",
    options: { effort: "max" },
    thinkingConfig: { thinkingLevel: "HIGH" },
  },
  {
    name: "an explicit effort wins over the budget",
    options: { effort: "low", thinkingBudget: 2048 },
    thinkingConfig: { thinkingLevel: "LOW" },
  },
  {
    name: "a thinking budget alone is sent as is",
    options: { thinkingBudget: 2048 },
    thinkingConfig: { thinkingBudget: 2048 },
  },
  {
    name: "sends no thinking config when neither is set",
    options: {},
    thinkingConfig: undefined,
  },
];

const hi = [
  {
    role: "user" as const,
    content: [{ kind: "text" as const, text: "hi" }],
  },
];

for (const provider of providers) {
  for (const tc of effortCases) {
    for (const stream of [false, true]) {
      Deno.test(`${provider.name} effort (stream ${stream}): ${tc.name}`, async () => {
        const sent: Record<string, unknown>[] = [];
        const target = provider.create(capturingGenAIClient(sent, doneReply));

        await generateOrStream(target, { messages: hi, ...tc.options }, stream);

        assert.assertEquals(
          sentConfig(sent)["thinkingConfig"],
          tc.thinkingConfig,
        );
      });
    }
  }

  Deno.test(`${provider.name} rejects an unknown effort level before sending`, async () => {
    const sent: Record<string, unknown>[] = [];
    const target = provider.create(capturingGenAIClient(sent, doneReply));
    const options = {
      messages: hi,
      effort: "huge" as generation.Effort,
    };

    const result = await target.generateText(options);
    assert.assert(results.isFail(result), "generateText succeeded");
    assert.assertInstanceOf(result.error, errors.BadRequestError);

    const events: generation.StreamEvent[] = [];
    for await (const event of target.streamText(options)) {
      events.push(event);
    }

    assert.assertEquals(events.length, 1);
    assert.assert(events[0]?.kind === "error");
    assert.assertInstanceOf(events[0].error, errors.BadRequestError);
    assert.assertEquals(sent.length, 0);
  });

  // The SDK reads these fields from config only. Set next to it, as they used
  // to be, they never reached the API, and neither did the abort signal under
  // httpOptions.
  for (const stream of [false, true]) {
    Deno.test(`${provider.name} sends the system prompt, tools, safety settings and signal in config (stream ${stream})`, async () => {
      const tools = [
        {
          name: "get_weather",
          description: "current weather",
          parameters: { type: "object" },
        },
      ];
      const safetySettings = [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE",
        },
      ];
      const sent: Record<string, unknown>[] = [];
      const target = provider.create(capturingGenAIClient(sent, doneReply));
      const controller = new AbortController();

      await generateOrStream(
        target,
        { messages: hi, system: "be brief", tools, safetySettings },
        stream,
        controller.signal,
      );

      assert.assertEquals(Object.keys(sent[0]!).sort(), [
        "config",
        "contents",
        "model",
      ]);

      const sentRequestConfig = sentConfig(sent);
      assert.assertEquals(sentRequestConfig["systemInstruction"], "be brief");
      assert.assertEquals(
        sentRequestConfig["tools"],
        googleShared.mapToolsToGenAI(tools),
      );
      assert.assertEquals(sentRequestConfig["safetySettings"], safetySettings);
      assert.assertStrictEquals(
        sentRequestConfig["abortSignal"],
        controller.signal,
      );
      assert.assertEquals(sentRequestConfig["httpOptions"], undefined);
    });
  }
}

Deno.test("buildGenAIRequest takes the system prompt from a system message", () => {
  const request = googleShared.buildGenAIRequest(
    config.withDefaults({ provider: "gemini", model: "gemini-test" }),
    {
      messages: [
        { role: "system", content: [{ kind: "text", text: "be brief" }] },
        ...hi,
      ],
    },
    "gemini",
    undefined,
  );

  assert.assertEquals(request.config["systemInstruction"], "be brief");
  assert.assertEquals(request.contents.length, 1);
  assert.assertEquals(request.config["abortSignal"], undefined);
});

// TASK-158 parity with Go: json_schema is sent as responseJsonSchema, which
// takes the schema as is, never next to responseSchema; json_object and text
// send only their MIME type.
const titleSchema = {
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
  additionalProperties: false,
};

const responseFormatCases: ReadonlyArray<{
  readonly name: string;
  readonly responseFormat: generation.ResponseFormat;
  readonly fields: Record<string, unknown>;
}> = [
  {
    name: "json_schema sends the schema as responseJsonSchema",
    responseFormat: { type: "json_schema", jsonSchema: titleSchema },
    fields: {
      responseMimeType: "application/json",
      responseJsonSchema: titleSchema,
      responseSchema: undefined,
    },
  },
  {
    name: "json_object sends only the JSON MIME type",
    responseFormat: { type: "json_object" },
    fields: {
      responseMimeType: "application/json",
      responseJsonSchema: undefined,
      responseSchema: undefined,
    },
  },
  {
    name: "text sends only the plain text MIME type",
    responseFormat: { type: "text" },
    fields: {
      responseMimeType: "text/plain",
      responseJsonSchema: undefined,
      responseSchema: undefined,
    },
  },
];

for (const tc of responseFormatCases) {
  Deno.test(`buildGenAIRequest: ${tc.name}`, () => {
    const request = googleShared.buildGenAIRequest(
      config.withDefaults({ provider: "gemini", model: "gemini-test" }),
      { messages: hi, responseFormat: tc.responseFormat },
      "gemini",
      undefined,
    );

    for (const [field, value] of Object.entries(tc.fields)) {
      assert.assertEquals(request.config[field], value, field);
    }
  });
}
