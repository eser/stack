// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as configModule from "./config.ts";

bdd.describe("withDefaults", () => {
  bdd.it("should apply default values for missing fields", () => {
    const target: configModule.ConfigTarget = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    const resolved = configModule.withDefaults(target);
    assert.assertEquals(resolved.maxTokens, 16_000);
    assert.assertEquals(resolved.temperature, 0.7);
    assert.assertEquals(resolved.requestTimeoutMs, 60_000);
  });

  bdd.it("should preserve explicitly set values", () => {
    const target: configModule.ConfigTarget = {
      provider: "openai",
      model: "gpt-4",
      maxTokens: 4096,
      temperature: 0.0,
      requestTimeoutMs: 120_000,
    };

    const resolved = configModule.withDefaults(target);
    assert.assertEquals(resolved.maxTokens, 4096);
    assert.assertEquals(resolved.temperature, 0.0);
    assert.assertEquals(resolved.requestTimeoutMs, 120_000);
  });

  bdd.it("should preserve all original fields", () => {
    const target: configModule.ConfigTarget = {
      provider: "vertexai",
      model: "gemini-pro",
      apiKey: "test-key",
      baseUrl: "https://custom.api.com",
      projectId: "my-project",
      location: "us-central1",
      properties: { batch_bucket: "my-bucket" },
    };

    const resolved = configModule.withDefaults(target);
    assert.assertEquals(resolved.provider, "vertexai");
    assert.assertEquals(resolved.apiKey, "test-key");
    assert.assertEquals(resolved.baseUrl, "https://custom.api.com");
    assert.assertEquals(resolved.projectId, "my-project");
    assert.assertEquals(resolved.location, "us-central1");
    assert.assertEquals(resolved.properties?.["batch_bucket"], "my-bucket");
  });
});
