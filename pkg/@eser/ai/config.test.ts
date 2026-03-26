// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as configModule from "./config.ts";

describe("withDefaults", () => {
  it("should apply default values for missing fields", () => {
    const target: configModule.ConfigTarget = {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    };

    const resolved = configModule.withDefaults(target);
    assertEquals(resolved.maxTokens, 1024);
    assertEquals(resolved.temperature, 0.7);
    assertEquals(resolved.requestTimeoutMs, 60_000);
  });

  it("should preserve explicitly set values", () => {
    const target: configModule.ConfigTarget = {
      provider: "openai",
      model: "gpt-4",
      maxTokens: 4096,
      temperature: 0.0,
      requestTimeoutMs: 120_000,
    };

    const resolved = configModule.withDefaults(target);
    assertEquals(resolved.maxTokens, 4096);
    assertEquals(resolved.temperature, 0.0);
    assertEquals(resolved.requestTimeoutMs, 120_000);
  });

  it("should preserve all original fields", () => {
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
    assertEquals(resolved.provider, "vertexai");
    assertEquals(resolved.apiKey, "test-key");
    assertEquals(resolved.baseUrl, "https://custom.api.com");
    assertEquals(resolved.projectId, "my-project");
    assertEquals(resolved.location, "us-central1");
    assertEquals(resolved.properties?.["batch_bucket"], "my-bucket");
  });
});
