// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Agent bridge — orchestrates AI calls for validation and spec generation.
 *
 * Tries @eser/ai first, falls back to claude CLI, falls back to manual.
 *
 * @module
 */

// =============================================================================
// Bridge Result
// =============================================================================

export type BridgeResult = {
  readonly text: string;
  readonly provider: string;
};

// =============================================================================
// Bridge
// =============================================================================

export const callAgent = async (
  prompt: string,
  system?: string,
): Promise<BridgeResult | null> => {
  // Try @eser/ai
  try {
    const result = await callViaEserAi(prompt, system);

    if (result !== null) {
      return result;
    }
  } catch {
    // Fall through
  }

  // Try claude CLI
  try {
    const result = await callViaClaude(prompt);

    if (result !== null) {
      return result;
    }
  } catch {
    // Fall through
  }

  // Manual — return null, caller handles
  return null;
};

// =============================================================================
// @eser/ai Integration
// =============================================================================

const callViaEserAi = async (
  prompt: string,
  system?: string,
): Promise<BridgeResult | null> => {
  try {
    const ai = await import("@eser/ai/mod");
    const adapters = await import("@eser/ai/adapters");
    const factories = await adapters.defaultFactories();
    const registry = new ai.Registry({ factories });

    // Try claude-code first, then anthropic
    const providers = ["claude-code", "anthropic", "openai"];

    for (const provider of providers) {
      try {
        await registry.addModel("default", { provider, model: "default" });
        const model = registry.getDefault();

        if (model !== null) {
          const result = await model.generateText({
            system,
            messages: [ai.textMessage("user", prompt)],
            maxTokens: 2048,
          });

          await registry.close();

          return { text: ai.text(result), provider };
        }
      } catch {
        // Try next provider
      }
    }

    await registry.close();
  } catch {
    // @eser/ai not available
  }

  return null;
};

// =============================================================================
// Claude CLI Spawn
// =============================================================================

const callViaClaude = async (
  prompt: string,
): Promise<BridgeResult | null> => {
  try {
    const shellExec = await import("@eser/shell/exec");
    const result = await shellExec
      .exec`claude -p ${prompt} --output-format json --max-turns 1`
      .noThrow()
      .text();

    if (result.length > 0) {
      try {
        const parsed = JSON.parse(result);
        const text = parsed.result ?? parsed.message?.content?.[0]?.text ??
          result;

        return { text: String(text), provider: "claude-cli" };
      } catch {
        return { text: result, provider: "claude-cli" };
      }
    }
  } catch {
    // claude not available
  }

  return null;
};
