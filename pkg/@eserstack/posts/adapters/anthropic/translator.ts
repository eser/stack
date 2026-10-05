// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AnthropicTranslator: a Translator backed by @eserstack/ai. It builds the
 * model registry on the first translate() call, so constructing it does not
 * pay the `defaultFactories()` cost.
 *
 * The prompt keeps the text and the language codes in tagged data sections;
 * translation-prompt.ts builds it and checks the reply.
 */

import * as results from "@eserstack/primitives/results";
import type { Translator } from "../../application/translator.ts";
import * as ai from "@eserstack/ai/mod";
import * as aiAdapters from "@eserstack/ai/adapters";
import * as translationPrompt from "./translation-prompt.ts";

export interface AnthropicTranslatorConfig {
  /** Anthropic model ID to use. Defaults to claude-haiku-4-5. */
  model?: string;
  /**
   * Anthropic API key. When omitted, the Anthropic SDK reads
   * ANTHROPIC_API_KEY from the process environment.
   */
  apiKey?: string;
}

const DEFAULT_MODEL = "claude-haiku-4-5";

// Leaves room for the longest post the domain allows (25000 characters on a
// Twitter/X Premium+ account), and for thinking on models that think by
// default, where thinking counts toward the limit.
const MAX_TOKENS = 16_000;

/** Implements Translator using @eserstack/ai Registry + Anthropic adapter. */
export class AnthropicTranslator implements Translator {
  private readonly config: Omit<AnthropicTranslatorConfig, "apiKey">;
  // A private field, so the key stays out of JSON and inspect output.
  readonly #apiKey: string | undefined;
  private cachedModel: ai.LanguageModel | undefined;

  constructor(config: AnthropicTranslatorConfig = {}) {
    const { apiKey, ...settings } = config;
    this.config = settings;
    this.#apiKey = apiKey;
  }

  private async getModel(): Promise<ai.LanguageModel> {
    if (this.cachedModel !== undefined) return this.cachedModel;
    const registry = new ai.Registry({
      factories: await aiAdapters.defaultFactories(),
    });
    this.cachedModel = await registry.addModel("translator", {
      provider: "anthropic",
      model: this.config.model ?? DEFAULT_MODEL,
      ...(this.#apiKey !== undefined && { apiKey: this.#apiKey }),
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
      system: translationPrompt.TRANSLATION_SYSTEM_PROMPT,
      messages: [
        ai.textMessage(
          "user",
          translationPrompt.buildTranslationPrompt(params),
        ),
      ],
      maxTokens: MAX_TOKENS,
    });
    if (results.isFail(generateResult)) {
      return results.fail(generateResult.error);
    }
    return translationPrompt.readTranslation(
      generateResult.value,
      params,
      MAX_TOKENS,
    );
  }
}
