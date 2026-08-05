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

// The in-flight promise is cached, not the resolved value. Caching the value
// meant two concurrent first calls both ran the FFI load, and — worse — a load
// that failed was retried forever while one that succeeded was never revisited.
let cachedFactories: Promise<readonly model.ProviderFactory[]> | null = null;

/**
 * Returns the default set of provider factories.
 *
 * The Go FFI bridge is preferred per provider, with the pure-TypeScript adapter
 * used for any provider the bridge does not offer. The result is cached after
 * the first call.
 *
 * # Per provider, not all-or-nothing
 *
 * This used to be a single switch: if the bridge loaded at all, its factories
 * replaced the entire TS set; otherwise the TS set was used whole. The doc
 * comment described the per-provider behaviour, but the code never did it.
 *
 * The payload losses that once made the two sets non-interchangeable are fixed:
 * the bridge now carries every generation option, tool definitions, tool calls
 * in both directions, image/audio payloads, AbortSignal and the typed error
 * hierarchy.
 *
 * The TS adapters are kept anyway, and not out of inertia. They are the only
 * working path when `@eserstack/ajan` cannot load a NATIVE binary — an npm
 * install whose per-platform optionalDependency did not install, or a platform
 * with no prebuilt artifact. The bridge deliberately refuses to load over WASM
 * (see tryLoadBridgeFactories) precisely so that case falls back here instead of
 * registering a provider that is present and broken.
 */
export const defaultFactories = (): Promise<
  readonly model.ProviderFactory[]
> => {
  cachedFactories ??= loadFactories();

  return cachedFactories;
};

/**
 * The pure-TypeScript adapter for each provider, behind a lazy import.
 *
 * Importers rather than instances so a caller that wants ONE provider pays for
 * one vendor SDK. `ai ask` resolves a single provider per invocation, and
 * eagerly importing all eight would make it load three SDKs it will not use.
 */
const TS_FACTORY_LOADERS: Record<
  string,
  () => Promise<model.ProviderFactory>
> = {
  anthropic: async () => (await import("./anthropic.ts")).anthropicFactory,
  openai: async () => (await import("./openai.ts")).openaiFactory,
  gemini: async () => (await import("./gemini.ts")).geminiFactory,
  vertexai: async () => (await import("./vertexai.ts")).vertexaiFactory,
  "claude-code": async () =>
    (await import("./claude-code.ts")).claudeCodeFactory,
  ollama: async () => (await import("./ollama.ts")).ollamaFactory,
  opencode: async () => (await import("./opencode.ts")).openCodeFactory,
  kiro: async () => (await import("./kiro.ts")).kiroFactory,
};

// The bridge load is cached separately from defaultFactories so a single-provider
// lookup does not repeat the dlopen, and so both paths agree on what the bridge
// offers.
let cachedBridge: Promise<readonly model.ProviderFactory[]> | null = null;

const bridgeFactories = (): Promise<readonly model.ProviderFactory[]> => {
  cachedBridge ??= (async () => {
    const { tryLoadBridgeFactories } = await import("./ajan-bridge.ts");

    return await tryLoadBridgeFactories();
  })();

  return cachedBridge;
};

/**
 * Returns the pure-TypeScript adapter for one provider, bypassing the bridge.
 *
 * This is what a machine with no usable native binary gets, so it is also the
 * only way to exercise that path without disabling FFI process-wide — which a
 * test cannot do, because `Deno.env.set` affects every other test file in the
 * process, not just its own isolate.
 *
 * Undefined for a provider with no TypeScript adapter.
 */
export const tsFactoryFor = async (
  provider: string,
): Promise<model.ProviderFactory | undefined> =>
  await TS_FACTORY_LOADERS[provider]?.();

/**
 * Returns the factory for one provider, applying the same preference
 * {@link defaultFactories} does: the Go bridge when it offers that provider,
 * the pure-TypeScript adapter otherwise.
 *
 * Undefined for a provider neither side knows.
 *
 * This exists so a single-provider caller does not have to choose between the
 * merge and laziness. `ai ask` previously hand-rolled its own switch over the
 * TS adapters, which meant it silently never used the bridge at all.
 */
export const factoryFor = async (
  provider: string,
): Promise<model.ProviderFactory | undefined> => {
  for (const factory of await bridgeFactories()) {
    if (factory.provider === provider) {
      return factory;
    }
  }

  return await tsFactoryFor(provider);
};

const loadFactories = async (): Promise<readonly model.ProviderFactory[]> => {
  const tsFactories = await Promise.all(
    Object.values(TS_FACTORY_LOADERS).map((load) => load()),
  );

  const byProvider = new Map<string, model.ProviderFactory>();

  // TS first, bridge second: the bridge wins where it has an entry, and the TS
  // adapter remains for every provider it does not.
  for (const factory of tsFactories) {
    byProvider.set(factory.provider, factory);
  }

  for (const factory of await bridgeFactories()) {
    byProvider.set(factory.provider, factory);
  }

  return [...byProvider.values()];
};
