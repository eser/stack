// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AnthropicTranslator — Translator implementation backed by @eserstack/ai.
 * Lazy-initializes the Registry on first translate() call to avoid paying
 * the `defaultFactories()` cost at construction time.
 */

import * as results from "@eserstack/primitives/results";
import type { Translator } from "../../application/translator.ts";
import * as ai from "@eserstack/ai/mod";
import * as aiAdapters from "@eserstack/ai/adapters";

export interface AnthropicTranslatorConfig {
  /** Anthropic model ID to use. Defaults to claude-haiku-4-5-20251001. */
  model?: string;
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Implements Translator using @eserstack/ai Registry + Anthropic adapter. */
export class AnthropicTranslator implements Translator {
  private readonly config: AnthropicTranslatorConfig;
  private cachedModel: ai.LanguageModel | undefined;

  constructor(config: AnthropicTranslatorConfig = {}) {
    this.config = config;
  }

  private async getModel(): Promise<ai.LanguageModel> {
    if (this.cachedModel !== undefined) return this.cachedModel;
    const registry = new ai.Registry({
      factories: await aiAdapters.defaultFactories(),
    });
    this.cachedModel = await registry.addModel("translator", {
      provider: "anthropic",
      model: this.config.model ?? DEFAULT_MODEL,
    });
    return this.cachedModel;
  }

  async translate(params: {
    text: string;
    from: string;
    to: string;
  }): Promise<results.Result<string, Error>> {
    const model = await this.getModel();
    const generateResult = await model.generateText({
      messages: [
        ai.textMessage(
          "user",
          `Translate the following text from ${params.from} to ${params.to}. ` +
            `Return only the translated text — no explanation, no preamble:\n\n${params.text}`,
        ),
      ],
      maxTokens: 1024,
    });
    return results.map(generateResult, ai.text);
  }
}
