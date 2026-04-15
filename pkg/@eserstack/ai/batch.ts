// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as generation from "./generation.ts";

// =============================================================================
// Batch Status
// =============================================================================

export type BatchStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

// =============================================================================
// Batch Request
// =============================================================================

export type BatchRequestItem = {
  readonly customId: string;
  readonly options: generation.GenerateTextOptions;
};

export type BatchRequest = {
  readonly items: readonly BatchRequestItem[];
};

// =============================================================================
// Batch Job
// =============================================================================

export type BatchStorage = {
  readonly type: string;
  readonly inputRef?: string;
  readonly outputRef?: string;
  readonly properties?: Record<string, unknown>;
};

export type BatchJob = {
  readonly id: string;
  readonly status: BatchStatus;
  readonly createdAt: Date;
  readonly completedAt?: Date;
  readonly totalCount: number;
  readonly doneCount: number;
  readonly failedCount: number;
  readonly storage?: BatchStorage;
  readonly error?: string;
};

// =============================================================================
// Batch Result
// =============================================================================

export type BatchResult = {
  readonly customId: string;
  readonly result?: generation.GenerateTextResult;
  readonly error?: string;
};

// =============================================================================
// List Options
// =============================================================================

export type ListBatchOptions = {
  readonly limit?: number;
  readonly after?: string;
};
