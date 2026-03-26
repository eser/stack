// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertRejects } from "@std/assert";
import type * as types from "./types.ts";
import type * as config from "./config.ts";
import type * as generation from "./generation.ts";
import type * as model from "./model.ts";
import * as errorsModule from "./errors.ts";
import { Registry } from "./registry.ts";

// =============================================================================
// Mock Factory & Model
// =============================================================================

const createMockModel = (
  provider: string,
  modelId: string,
  capabilities: readonly types.ProviderCapability[] = ["text_generation"],
): model.LanguageModel => ({
  capabilities,
  provider,
  modelId,
  generateText(): Promise<generation.GenerateTextResult> {
    return Promise.resolve({
      content: [{ kind: "text", text: "mock response" }],
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      modelId,
    });
  },
  async *streamText(): AsyncIterable<generation.StreamEvent> {
    yield { kind: "content_delta", textDelta: "mock" };
    yield {
      kind: "message_done",
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  },
  close(): Promise<void> {
    return Promise.resolve();
  },
  getRawClient(): unknown {
    return null;
  },
});

const mockFactory: model.ProviderFactory = {
  provider: "mock",
  createModel(cfg: config.ResolvedConfigTarget): Promise<model.LanguageModel> {
    return Promise.resolve(createMockModel("mock", cfg.model));
  },
};

const mockStreamingFactory: model.ProviderFactory = {
  provider: "mock-streaming",
  createModel(cfg: config.ResolvedConfigTarget): Promise<model.LanguageModel> {
    return Promise.resolve(
      createMockModel("mock-streaming", cfg.model, [
        "text_generation",
        "streaming",
      ]),
    );
  },
};

// =============================================================================
// Tests
// =============================================================================

describe("Registry", () => {
  it("should create with no options", () => {
    const registry = new Registry();
    assertEquals(registry.listModels().length, 0);
    assertEquals(registry.listRegisteredProviders().length, 0);
  });

  it("should accept factories in constructor", () => {
    const registry = new Registry({ factories: [mockFactory] });
    assertEquals(registry.listRegisteredProviders().length, 1);
    assertEquals(registry.listRegisteredProviders()[0], "mock");
  });

  it("should register a factory", () => {
    const registry = new Registry();
    registry.registerFactory(mockFactory);
    assertEquals(registry.listRegisteredProviders().includes("mock"), true);
  });

  it("should add a model", async () => {
    const registry = new Registry({ factories: [mockFactory] });
    const m = await registry.addModel("default", {
      provider: "mock",
      model: "test-v1",
    });
    assertEquals(m.modelId, "test-v1");
    assertEquals(registry.listModels().includes("default"), true);
  });

  it("should throw ModelAlreadyExistsError on duplicate name", async () => {
    const registry = new Registry({ factories: [mockFactory] });
    await registry.addModel("default", { provider: "mock", model: "test-v1" });

    await assertRejects(
      () =>
        registry.addModel("default", { provider: "mock", model: "test-v2" }),
      errorsModule.ModelAlreadyExistsError,
    );
  });

  it("should throw UnsupportedProviderError for unknown provider", async () => {
    const registry = new Registry();

    await assertRejects(
      () =>
        registry.addModel("default", { provider: "unknown", model: "test" }),
      errorsModule.UnsupportedProviderError,
    );
  });

  it("should get default model", async () => {
    const registry = new Registry({ factories: [mockFactory] });
    await registry.addModel("default", { provider: "mock", model: "test-v1" });

    const m = registry.getDefault();
    assertEquals(m?.modelId, "test-v1");
  });

  it("should fall back to first model when no 'default' exists", async () => {
    const registry = new Registry({ factories: [mockFactory] });
    await registry.addModel("custom", { provider: "mock", model: "test-v1" });

    const m = registry.getDefault();
    assertEquals(m?.modelId, "test-v1");
  });

  it("should return null when registry is empty", () => {
    const registry = new Registry();
    assertEquals(registry.getDefault(), null);
  });

  it("should get named model", async () => {
    const registry = new Registry({ factories: [mockFactory] });
    await registry.addModel("claude", { provider: "mock", model: "claude-3" });

    assertEquals(registry.getNamed("claude")?.modelId, "claude-3");
    assertEquals(registry.getNamed("nonexistent"), null);
  });

  it("should get models by provider", async () => {
    const registry = new Registry({
      factories: [mockFactory, mockStreamingFactory],
    });
    await registry.addModel("m1", { provider: "mock", model: "a" });
    await registry.addModel("m2", { provider: "mock", model: "b" });
    await registry.addModel("m3", { provider: "mock-streaming", model: "c" });

    assertEquals(registry.getByProvider("mock").length, 2);
    assertEquals(registry.getByProvider("mock-streaming").length, 1);
    assertEquals(registry.getByProvider("nonexistent").length, 0);
  });

  it("should get models by capability", async () => {
    const registry = new Registry({
      factories: [mockFactory, mockStreamingFactory],
    });
    await registry.addModel("m1", { provider: "mock", model: "a" });
    await registry.addModel("m2", { provider: "mock-streaming", model: "b" });

    assertEquals(registry.getByCapability("text_generation").length, 2);
    assertEquals(registry.getByCapability("streaming").length, 1);
    assertEquals(registry.getByCapability("vision").length, 0);
  });

  it("should remove a model", async () => {
    const registry = new Registry({ factories: [mockFactory] });
    await registry.addModel("test", { provider: "mock", model: "v1" });
    assertEquals(registry.listModels().length, 1);

    await registry.removeModel("test");
    assertEquals(registry.listModels().length, 0);
  });

  it("should throw ModelNotFoundError when removing nonexistent model", async () => {
    const registry = new Registry();

    await assertRejects(
      () => registry.removeModel("nonexistent"),
      errorsModule.ModelNotFoundError,
    );
  });

  it("should load from config", async () => {
    const registry = new Registry({ factories: [mockFactory] });

    await registry.loadFromConfig({
      targets: {
        default: { provider: "mock", model: "model-a" },
        secondary: { provider: "mock", model: "model-b" },
      },
    });

    assertEquals(registry.listModels().length, 2);
    assertEquals(registry.getNamed("default")?.modelId, "model-a");
    assertEquals(registry.getNamed("secondary")?.modelId, "model-b");
  });

  it("should close all models", async () => {
    let closedCount = 0;
    const trackingFactory: model.ProviderFactory = {
      provider: "tracking",
      createModel(
        cfg: config.ResolvedConfigTarget,
      ): Promise<model.LanguageModel> {
        const m = createMockModel("tracking", cfg.model);

        return Promise.resolve({
          ...m,
          close() {
            closedCount++;

            return Promise.resolve();
          },
        });
      },
    };

    const registry = new Registry({ factories: [trackingFactory] });
    await registry.addModel("a", { provider: "tracking", model: "x" });
    await registry.addModel("b", { provider: "tracking", model: "y" });

    await registry.close();
    assertEquals(closedCount, 2);
    assertEquals(registry.listModels().length, 0);
  });
});
