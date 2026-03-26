// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * AI provider detection — checks which providers are available.
 *
 * Used by `ai list` and `@eser/noskills` init.
 *
 * @module
 */

import * as shellExec from "@eser/shell/exec";

// =============================================================================
// Types
// =============================================================================

export type ProviderStatus = {
  readonly name: string;
  readonly alias: string;
  readonly type: string;
  readonly available: boolean;
  readonly detail: string;
};

// =============================================================================
// Checks
// =============================================================================

const checkBinaryExists = async (name: string): Promise<boolean> => {
  try {
    const code = await shellExec.exec`which ${name}`.noThrow().code();
    return code === 0;
  } catch {
    return false;
  }
};

const checkOllamaReachable = async (): Promise<boolean> => {
  try {
    const response = await fetch("http://localhost:11434/api/version", {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const checkEnvVar = (name: string): boolean => {
  if (typeof globalThis.Deno !== "undefined") {
    return Deno.env.get(name) !== undefined;
  }
  return false;
};

// =============================================================================
// Detection
// =============================================================================

export const detectAllProviders = async (): Promise<
  readonly ProviderStatus[]
> => {
  const [hasClaude, hasOllama, hasOpencode, hasKiro] = await Promise.all([
    checkBinaryExists("claude"),
    checkOllamaReachable(),
    checkBinaryExists("opencode"),
    checkBinaryExists("kiro"),
  ]);

  return [
    {
      name: "claude-code",
      alias: "cc",
      type: "CLI",
      available: hasClaude,
      detail: hasClaude ? "claude binary found" : "claude not on PATH",
    },
    {
      name: "ollama",
      alias: "ol",
      type: "HTTP",
      available: hasOllama,
      detail: hasOllama
        ? "localhost:11434 reachable"
        : "localhost:11434 not reachable",
    },
    {
      name: "opencode",
      alias: "oc",
      type: "CLI",
      available: hasOpencode,
      detail: hasOpencode ? "opencode binary found" : "opencode not on PATH",
    },
    {
      name: "kiro",
      alias: "kr",
      type: "CLI",
      available: hasKiro,
      detail: hasKiro ? "kiro binary found" : "kiro not on PATH",
    },
    {
      name: "anthropic",
      alias: "ant",
      type: "API",
      available: checkEnvVar("ANTHROPIC_API_KEY"),
      detail: checkEnvVar("ANTHROPIC_API_KEY")
        ? "ANTHROPIC_API_KEY set"
        : "ANTHROPIC_API_KEY not set",
    },
    {
      name: "openai",
      alias: "oai",
      type: "API",
      available: checkEnvVar("OPENAI_API_KEY"),
      detail: checkEnvVar("OPENAI_API_KEY")
        ? "OPENAI_API_KEY set"
        : "OPENAI_API_KEY not set",
    },
    {
      name: "gemini",
      alias: "gem",
      type: "API",
      available: checkEnvVar("GEMINI_API_KEY") || checkEnvVar("GOOGLE_API_KEY"),
      detail: (checkEnvVar("GEMINI_API_KEY") || checkEnvVar("GOOGLE_API_KEY"))
        ? "API key set"
        : "GEMINI_API_KEY not set",
    },
    {
      name: "vertexai",
      alias: "vtx",
      type: "API",
      available: checkEnvVar("GOOGLE_CLOUD_PROJECT"),
      detail: checkEnvVar("GOOGLE_CLOUD_PROJECT")
        ? "GOOGLE_CLOUD_PROJECT set"
        : "GOOGLE_CLOUD_PROJECT not set",
    },
  ];
};

export const getAvailableProviderNames = async (): Promise<
  readonly string[]
> => {
  const providers = await detectAllProviders();
  return providers.filter((p) => p.available).map((p) => p.name);
};
