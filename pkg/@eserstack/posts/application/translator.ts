// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Translator — outbound port for text translation.
 * Adapters (e.g., AnthropicTranslator via @eserstack/ai) implement this interface.
 */

import type * as results from "@eserstack/primitives/results";

/** Outbound port: language translation. */
export interface Translator {
  /**
   * Translate text from one language to another.
   * Language codes follow BCP 47 (e.g., "tr", "en", "de").
   */
  translate(
    params: { text: string; from: string; to: string },
  ): Promise<results.Result<string, Error>>;
}
