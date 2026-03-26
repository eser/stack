// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as model from "../model.ts";

// Adapter factories
export { anthropicFactory, AnthropicModel } from "./anthropic.ts";
export { openaiFactory, OpenAIModel } from "./openai.ts";
export { geminiFactory, GeminiModel } from "./gemini.ts";
export { vertexaiFactory, VertexAIModel } from "./vertexai.ts";

// Shared Google utilities
export {
  classifyGenAIError,
  mapContentBlockToGenAIPart,
  mapGenAIResponseToResult,
  mapMessagesToGenAI,
  mapRoleToGenAI,
  mapToolsToGenAI,
} from "./google-shared.ts";

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

  const { anthropicFactory } = await import("./anthropic.ts");
  const { openaiFactory } = await import("./openai.ts");
  const { geminiFactory } = await import("./gemini.ts");
  const { vertexaiFactory } = await import("./vertexai.ts");

  cachedFactories = [
    anthropicFactory,
    openaiFactory,
    geminiFactory,
    vertexaiFactory,
  ];

  return cachedFactories;
};
