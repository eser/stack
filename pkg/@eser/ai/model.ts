// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "./types.ts";
import type * as config from "./config.ts";
import type * as generation from "./generation.ts";
import type * as batch from "./batch.ts";

// =============================================================================
// Language Model Interface
// =============================================================================

export type LanguageModel = {
  readonly capabilities: readonly types.ProviderCapability[];
  readonly provider: string;
  readonly modelId: string;

  generateText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): Promise<generation.GenerateTextResult>;

  streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent>;

  close(): Promise<void>;

  getRawClient(): unknown;
};

// =============================================================================
// Batch-Capable Model Interface
// =============================================================================

export type BatchCapableModel = LanguageModel & {
  submitBatch(
    request: batch.BatchRequest,
    signal?: AbortSignal,
  ): Promise<batch.BatchJob>;

  getBatchJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<batch.BatchJob>;

  listBatchJobs(
    options?: batch.ListBatchOptions,
    signal?: AbortSignal,
  ): Promise<readonly batch.BatchJob[]>;

  downloadBatchResults(
    job: batch.BatchJob,
    signal?: AbortSignal,
  ): Promise<readonly batch.BatchResult[]>;

  cancelBatchJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<void>;
};

// =============================================================================
// Type Guard
// =============================================================================

export const isBatchCapable = (
  model: LanguageModel,
): model is BatchCapableModel => {
  const candidate = model as Partial<BatchCapableModel>;

  return (
    typeof candidate.submitBatch === "function" &&
    typeof candidate.getBatchJob === "function" &&
    typeof candidate.listBatchJobs === "function" &&
    typeof candidate.downloadBatchResults === "function" &&
    typeof candidate.cancelBatchJob === "function"
  );
};

// =============================================================================
// Provider Factory
// =============================================================================

export type ProviderFactory = {
  readonly provider: string;
  createModel(config: config.ResolvedConfigTarget): Promise<LanguageModel>;
};
