// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as model from "../model.ts";

// API adapter factories
export { anthropicFactory, AnthropicModel } from "./anthropic.ts";
export { openaiFactory, OpenAIModel } from "./openai.ts";
export { geminiFactory, GeminiModel } from "./gemini.ts";
export { vertexaiFactory, VertexAIModel } from "./vertexai.ts";

// CLI / local adapter factories
export { claudeCodeFactory, ClaudeCodeModel } from "./claude-code.ts";
export { ollamaFactory, OllamaModel } from "./ollama.ts";
export { openCodeFactory, OpenCodeModel } from "./opencode.ts";
export { kiroFactory, KiroModel } from "./kiro.ts";

// Go FFI bridge (requires @eserstack/ajan native library or WASM)
export {
  AjanBridgeModel,
  AjanBridgeModelFactory,
  createBridgeFactories,
  tryLoadBridgeFactories,
} from "./ajan-bridge.ts";

// Shared utilities
export {
  classifyGenAIError,
  mapContentBlockToGenAIPart,
  mapGenAIResponseToResult,
  mapMessagesToGenAI,
  mapRoleToGenAI,
  mapToolsToGenAI,
} from "./google-shared.ts";
export {
  captureStderr,
  classifyExitCode,
  formatMessagesAsText,
  parseJsonlStream,
  parseTextOutput,
  resolveBinary,
  spawnCliProcess,
} from "./cli-shared.ts";

// =============================================================================
// Default Factories
// =============================================================================

let cachedFactories: readonly model.ProviderFactory[] | null = null;

/**
 * Returns the default set of provider factories.
 *
 * Attempts to load Go FFI bridge factories first (via @eserstack/ajan).
 * Falls back to pure-TypeScript factories for any provider where FFI is
 * unavailable. The result is cached after the first call.
 */
export const defaultFactories = async (): Promise<
  readonly model.ProviderFactory[]
> => {
  if (cachedFactories !== null) {
    return cachedFactories;
  }

  // Try Go FFI bridge first — provides better performance for all providers.
  const { tryLoadBridgeFactories } = await import("./ajan-bridge.ts");
  const bridgeFactories = await tryLoadBridgeFactories();

  if (bridgeFactories.length > 0) {
    cachedFactories = bridgeFactories;
    return cachedFactories;
  }

  // Pure-TypeScript fallback when FFI is unavailable.
  const { anthropicFactory } = await import("./anthropic.ts");
  const { openaiFactory } = await import("./openai.ts");
  const { geminiFactory } = await import("./gemini.ts");
  const { vertexaiFactory } = await import("./vertexai.ts");
  const { claudeCodeFactory } = await import("./claude-code.ts");
  const { ollamaFactory } = await import("./ollama.ts");
  const { openCodeFactory } = await import("./opencode.ts");
  const { kiroFactory } = await import("./kiro.ts");

  cachedFactories = [
    anthropicFactory,
    openaiFactory,
    geminiFactory,
    vertexaiFactory,
    claudeCodeFactory,
    ollamaFactory,
    openCodeFactory,
    kiroFactory,
  ];

  return cachedFactories;
};
