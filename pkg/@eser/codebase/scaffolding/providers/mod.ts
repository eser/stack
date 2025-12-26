// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Provider registry and specifier resolution
 *
 * Handles parsing specifiers like "owner/repo", "gh:owner/repo", "github:owner/repo"
 * and resolving them to the appropriate provider.
 *
 * @module
 */

import type { ParsedSpecifier, Provider, ProviderRef } from "./types.ts";
import { githubProvider } from "./github.ts";

export type {
  GitHubRef,
  ParsedSpecifier,
  Provider,
  ProviderRef,
} from "./types.ts";

// Provider registry state (lazy initialized)
type RegistryState = {
  providers: Map<string, Provider>;
  defaultProvider: Provider | null;
  initialized: boolean;
};

const state: RegistryState = {
  providers: new Map(),
  defaultProvider: null,
  initialized: false,
};

/**
 * Initialize the registry with built-in providers (lazy)
 */
const ensureInitialized = (): void => {
  if (state.initialized) {
    return;
  }
  state.initialized = true;
  registerProvider(githubProvider);
};

/**
 * Register a provider in the registry
 */
export const registerProvider = (provider: Provider): void => {
  state.providers.set(provider.name, provider);

  // Register each prefix
  for (const prefix of provider.prefixes) {
    state.providers.set(prefix, provider);
  }

  // Set as default if marked
  if (provider.isDefault === true) {
    state.defaultProvider = provider;
  }
};

/**
 * Get a provider by name or prefix
 */
export const getProvider = (nameOrPrefix: string): Provider | null => {
  ensureInitialized();
  return state.providers.get(nameOrPrefix) ?? null;
};

/**
 * Get the default provider
 */
export const getDefaultProvider = (): Provider | null => {
  ensureInitialized();
  return state.defaultProvider;
};

/**
 * Parse a specifier and resolve to a provider
 *
 * Specifier formats:
 * - "owner/repo" - Uses default provider (GitHub)
 * - "gh:owner/repo" - Explicit GitHub
 * - "github:owner/repo" - Explicit GitHub
 * - "npm:package" - npm provider (future)
 * - "jsr:@scope/package" - JSR provider (future)
 *
 * @param input - The specifier to parse
 * @returns The resolved provider and parsed reference
 */
export const parseSpecifier = (input: string): ParsedSpecifier => {
  ensureInitialized();

  // Check for prefix (e.g., "github:", "gh:", "npm:")
  const colonIndex = input.indexOf(":");

  if (colonIndex !== -1) {
    const prefix = input.slice(0, colonIndex);
    const specifier = input.slice(colonIndex + 1);

    const provider = state.providers.get(prefix);
    if (provider === undefined) {
      throw new Error(`Unknown provider prefix: ${prefix}`);
    }

    return {
      provider,
      ref: provider.parse(specifier),
    };
  }

  // No prefix - use default provider
  if (state.defaultProvider === null) {
    throw new Error("No default provider registered");
  }

  return {
    provider: state.defaultProvider,
    ref: state.defaultProvider.parse(input),
  };
};

/**
 * Fetch a template using the appropriate provider
 *
 * @param specifier - The specifier (e.g., "owner/repo" or "gh:owner/repo")
 * @param targetDir - Directory to extract the template into
 */
export const fetchTemplate = async (
  specifier: string,
  targetDir: string,
): Promise<ProviderRef> => {
  const { provider, ref } = parseSpecifier(specifier);
  await provider.fetch(ref, targetDir);
  return ref;
};
