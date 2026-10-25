// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import * as config from "../config.ts";
import * as errors from "../errors.ts";
import type * as generation from "../generation.ts";
import type * as model from "../model.ts";
import * as gemini from "./gemini.ts";
import * as ollama from "./ollama.ts";
import * as openai from "./openai.ts";
import * as vertexai from "./vertexai.ts";

// TASK-158: like the Go adapters, the TypeScript adapters that send a
// json_schema format's schema fail with a BadRequestError before any request
// when the schema is missing or not an object. Anthropic and claude-code have
// their own tests.

/** Counts the requests a fake SDK client was asked to send. */
type Calls = { count: number };

const failingClient = (calls: Calls): unknown => {
  const send = () => {
    calls.count++;

    return Promise.reject(new Error("the request should not have been sent"));
  };

  return {
    chat: { completions: { create: send } },
    models: { generateContent: send, generateContentStream: send },
  };
};

const providers: ReadonlyArray<{
  readonly name: string;
  readonly create: (calls: Calls) => model.LanguageModel;
}> = [
  {
    name: "openai",
    create: (calls) =>
      new openai.OpenAIModel(
        failingClient(calls),
        config.withDefaults({ provider: "openai", model: "gpt-test" }),
      ),
  },
  {
    name: "gemini",
    create: (calls) =>
      new gemini.GeminiModel(
        failingClient(calls),
        config.withDefaults({ provider: "gemini", model: "gemini-test" }),
      ),
  },
  {
    name: "vertexai",
    create: (calls) =>
      new vertexai.VertexAIModel(
        failingClient(calls),
        config.withDefaults({ provider: "vertexai", model: "gemini-test" }),
      ),
  },
  {
    // Nothing listens on the discard port, so a request that was sent fails
    // with a connection error rather than a BadRequestError.
    name: "ollama",
    create: () =>
      new ollama.OllamaModel(
        "http://127.0.0.1:9",
        config.withDefaults({ provider: "ollama", model: "llama-test" }),
      ),
  },
];

const badFormats: ReadonlyArray<{
  readonly name: string;
  readonly responseFormat: generation.ResponseFormat;
}> = [
  { name: "no schema", responseFormat: { type: "json_schema" } },
  {
    name: "a schema that is not an object",
    responseFormat: {
      type: "json_schema",
      jsonSchema: ["title"] as unknown as Record<string, unknown>,
    },
  },
];

const hi = [{
  role: "user" as const,
  content: [{ kind: "text" as const, text: "name this post" }],
}];

for (const provider of providers) {
  for (const format of badFormats) {
    Deno.test(`${provider.name} rejects ${format.name} before sending`, async () => {
      const calls: Calls = { count: 0 };
      const target = provider.create(calls);
      const options = { messages: hi, responseFormat: format.responseFormat };

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
      assert.assertEquals(calls.count, 0);
    });
  }
}
