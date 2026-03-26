// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// =============================================================================
// Configuration Types
// =============================================================================

export type ConfigTarget = {
  readonly provider: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly requestTimeoutMs?: number;
  readonly projectId?: string;
  readonly location?: string;
  readonly properties?: Record<string, unknown>;
};

export type Config = {
  readonly targets: Record<string, ConfigTarget>;
};

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export type ResolvedConfigTarget = ConfigTarget & {
  readonly maxTokens: number;
  readonly temperature: number;
  readonly requestTimeoutMs: number;
};

export const withDefaults = (target: ConfigTarget): ResolvedConfigTarget => {
  return {
    ...target,
    maxTokens: target.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: target.temperature ?? DEFAULT_TEMPERATURE,
    requestTimeoutMs: target.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  };
};
