// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as primitiveResults from "@eserstack/primitives/results";
import type * as types from "./types.ts";
import type * as config from "./config.ts";
import type * as generation from "./generation.ts";
import type * as model from "./model.ts";
import * as errorsModule from "./errors.ts";
import * as registry from "./registry.ts";

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
  generateText(): Promise<
    primitiveResults.Result<generation.GenerateTextResult, errorsModule.AiError>
  > {
    return Promise.resolve(
      primitiveResults.ok({
        content: [{ kind: "text", text: "mock response" }],
        stopReason: "end_turn",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        modelId,
      }),
    );
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

bdd.describe("Registry", () => {
  bdd.it("should create with no options", () => {
    const modelRegistry = new registry.Registry();
    assert.assertEquals(modelRegistry.listModels().length, 0);
    assert.assertEquals(modelRegistry.listRegisteredProviders().length, 0);
  });

  bdd.it("should accept factories in constructor", () => {
    const modelRegistry = new registry.Registry({ factories: [mockFactory] });
    assert.assertEquals(modelRegistry.listRegisteredProviders().length, 1);
    assert.assertEquals(modelRegistry.listRegisteredProviders()[0], "mock");
  });

  bdd.it("should register a factory", () => {
    const modelRegistry = new registry.Registry();
    modelRegistry.registerFactory(mockFactory);
    assert.assertEquals(
      modelRegistry.listRegisteredProviders().includes("mock"),
      true,
    );
  });

  bdd.it("should add a model", async () => {
    const modelRegistry = new registry.Registry({ factories: [mockFactory] });
    const m = await modelRegistry.addModel("default", {
      provider: "mock",
      model: "test-v1",
    });
    assert.assertEquals(m.modelId, "test-v1");
    assert.assertEquals(modelRegistry.listModels().includes("default"), true);
  });

  bdd.it("should throw ModelAlreadyExistsError on duplicate name", async () => {
    const modelRegistry = new registry.Registry({ factories: [mockFactory] });
    await modelRegistry.addModel("default", {
      provider: "mock",
      model: "test-v1",
    });

    await assert.assertRejects(
      () =>
        modelRegistry.addModel("default", {
          provider: "mock",
          model: "test-v2",
        }),
      errorsModule.ModelAlreadyExistsError,
    );
  });

  bdd.it(
    "should throw UnsupportedProviderError for unknown provider",
    async () => {
      const modelRegistry = new registry.Registry();

      await assert.assertRejects(
        () =>
          modelRegistry.addModel("default", {
            provider: "unknown",
            model: "test",
          }),
        errorsModule.UnsupportedProviderError,
      );
    },
  );

  bdd.it("should get default model", async () => {
    const modelRegistry = new registry.Registry({ factories: [mockFactory] });
    await modelRegistry.addModel("default", {
      provider: "mock",
      model: "test-v1",
    });

    const m = modelRegistry.getDefault();
    assert.assertEquals(m?.modelId, "test-v1");
  });

  bdd.it(
    "should fall back to first model when no 'default' exists",
    async () => {
      const modelRegistry = new registry.Registry({ factories: [mockFactory] });
      await modelRegistry.addModel("custom", {
        provider: "mock",
        model: "test-v1",
      });

      const m = modelRegistry.getDefault();
      assert.assertEquals(m?.modelId, "test-v1");
    },
  );

  bdd.it("should return null when registry is empty", () => {
    const modelRegistry = new registry.Registry();
    assert.assertEquals(modelRegistry.getDefault(), null);
  });

  bdd.it("should get named model", async () => {
    const modelRegistry = new registry.Registry({ factories: [mockFactory] });
    await modelRegistry.addModel("claude", {
      provider: "mock",
      model: "claude-3",
    });

    assert.assertEquals(modelRegistry.getNamed("claude")?.modelId, "claude-3");
    assert.assertEquals(modelRegistry.getNamed("nonexistent"), null);
  });

  bdd.it("should get models by provider", async () => {
    const modelRegistry = new registry.Registry({
      factories: [mockFactory, mockStreamingFactory],
    });
    await modelRegistry.addModel("m1", { provider: "mock", model: "a" });
    await modelRegistry.addModel("m2", { provider: "mock", model: "b" });
    await modelRegistry.addModel("m3", {
      provider: "mock-streaming",
      model: "c",
    });

    assert.assertEquals(modelRegistry.getByProvider("mock").length, 2);
    assert.assertEquals(
      modelRegistry.getByProvider("mock-streaming").length,
      1,
    );
    assert.assertEquals(modelRegistry.getByProvider("nonexistent").length, 0);
  });

  bdd.it("should get models by capability", async () => {
    const modelRegistry = new registry.Registry({
      factories: [mockFactory, mockStreamingFactory],
    });
    await modelRegistry.addModel("m1", { provider: "mock", model: "a" });
    await modelRegistry.addModel("m2", {
      provider: "mock-streaming",
      model: "b",
    });

    assert.assertEquals(
      modelRegistry.getByCapability("text_generation").length,
      2,
    );
    assert.assertEquals(modelRegistry.getByCapability("streaming").length, 1);
    assert.assertEquals(modelRegistry.getByCapability("vision").length, 0);
  });

  bdd.it("should remove a model", async () => {
    const modelRegistry = new registry.Registry({ factories: [mockFactory] });
    await modelRegistry.addModel("test", { provider: "mock", model: "v1" });
    assert.assertEquals(modelRegistry.listModels().length, 1);

    await modelRegistry.removeModel("test");
    assert.assertEquals(modelRegistry.listModels().length, 0);
  });

  bdd.it(
    "should throw ModelNotFoundError when removing nonexistent model",
    async () => {
      const modelRegistry = new registry.Registry();

      await assert.assertRejects(
        () => modelRegistry.removeModel("nonexistent"),
        errorsModule.ModelNotFoundError,
      );
    },
  );

  bdd.it("should load from config", async () => {
    const modelRegistry = new registry.Registry({ factories: [mockFactory] });

    await modelRegistry.loadFromConfig({
      targets: {
        default: { provider: "mock", model: "model-a" },
        secondary: { provider: "mock", model: "model-b" },
      },
    });

    assert.assertEquals(modelRegistry.listModels().length, 2);
    assert.assertEquals(modelRegistry.getNamed("default")?.modelId, "model-a");
    assert.assertEquals(
      modelRegistry.getNamed("secondary")?.modelId,
      "model-b",
    );
  });

  bdd.it("should close all models", async () => {
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

    const modelRegistry = new registry.Registry({
      factories: [trackingFactory],
    });
    await modelRegistry.addModel("a", { provider: "tracking", model: "x" });
    await modelRegistry.addModel("b", { provider: "tracking", model: "y" });

    await modelRegistry.close();
    assert.assertEquals(closedCount, 2);
    assert.assertEquals(modelRegistry.listModels().length, 0);
  });
});
