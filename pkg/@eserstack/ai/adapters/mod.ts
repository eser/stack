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

export const defaultFactories = async (): Promise<
  readonly model.ProviderFactory[]
> => {
  if (cachedFactories !== null) {
    return cachedFactories;
  }

  // API adapters
  const { anthropicFactory } = await import("./anthropic.ts");
  const { openaiFactory } = await import("./openai.ts");
  const { geminiFactory } = await import("./gemini.ts");
  const { vertexaiFactory } = await import("./vertexai.ts");

  // CLI / local adapters
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
