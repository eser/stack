// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as config from "../config.ts";
import type * as model from "../model.ts";
import * as gemini from "./gemini.ts";
import * as vertexai from "./vertexai.ts";

const { runtime } = crossRuntime;

// @google/genai 3 calls the Gemini Developer API on v1 unless told otherwise,
// and reads GOOGLE_GENAI_API_VERSION when the code sets no version. The
// adapters pin the versions the Go twin calls (pkg/ajan/aifx/google_client.go):
// v1beta for Gemini and v1beta1 for Vertex AI.

const okResponse = () =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          content: { role: "model", parts: [{ text: "ok" }] },
          finishReason: "STOP",
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

/**
 * Runs one generateText call through `factory` with globalThis.fetch replaced,
 * and returns the URLs the SDK requested. No request leaves the process.
 */
const requestedUrls = async (
  factory: model.ProviderFactory,
  target: config.ConfigTarget,
): Promise<readonly string[]> => {
  const urls: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalVersion = runtime.env.get("GOOGLE_GENAI_API_VERSION");

  globalThis.fetch = (input) => {
    urls.push(input instanceof Request ? input.url : String(input));

    return Promise.resolve(okResponse());
  };
  // An operator's environment must not move the adapter to another version.
  runtime.env.set("GOOGLE_GENAI_API_VERSION", "v1");

  try {
    const languageModel = await factory.createModel(
      config.withDefaults(target),
    );
    await languageModel.generateText({
      messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }],
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalVersion === undefined) {
      runtime.env.delete("GOOGLE_GENAI_API_VERSION");
    } else {
      runtime.env.set("GOOGLE_GENAI_API_VERSION", originalVersion);
    }
  }

  return urls;
};

nodeTest.test("the gemini adapter calls the Gemini API on v1beta", async () => {
  const urls = await requestedUrls(gemini.geminiFactory, {
    provider: "gemini",
    apiKey: "test-key",
    model: "gemini-test",
  });

  assert.assertEquals(urls.length, 1);
  assert.assertStringIncludes(
    urls[0] ?? "",
    "/v1beta/models/gemini-test:generateContent",
  );
});

nodeTest.test("the vertexai adapter calls Vertex AI on v1beta1", async () => {
  const urls = await requestedUrls(vertexai.vertexaiFactory, {
    provider: "vertexai",
    apiKey: "test-key",
    model: "gemini-test",
  });

  assert.assertEquals(urls.length, 1);
  assert.assertStringIncludes(urls[0] ?? "", "/v1beta1/");
  assert.assertStringIncludes(urls[0] ?? "", "gemini-test:generateContent");
});
