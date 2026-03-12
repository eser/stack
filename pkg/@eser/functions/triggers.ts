// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Standard trigger event types for multi-source function invocation.
 *
 * These types represent the data shape provided by different invocation
 * sources (HTTP, queue, CLI, cron). They are used with `Adapter` from
 * `handler.ts` to transform trigger-specific events into handler input.
 *
 * @see {@link "./handler.ts"} for the adapter pattern
 *
 * @module
 */

// --- Trigger Event Types ---

/**
 * HTTP request event.
 * Compatible with API Gateway, Deno.serve, Express, Hono, etc.
 */
export type HttpEvent = {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
};

/**
 * Queue/message event.
 * Compatible with SQS, RabbitMQ, Kafka, BullMQ, etc.
 */
export type QueueEvent = {
  readonly messageId: string;
  readonly body: unknown;
  readonly attributes: Readonly<Record<string, string>>;
  readonly receiveCount: number;
};

/**
 * CLI invocation event.
 * Represents command-line arguments and flags.
 */
export type CliEvent = {
  readonly command: string;
  readonly args: readonly string[];
  readonly flags: Readonly<Record<string, unknown>>;
};

/**
 * Scheduled/cron trigger event.
 */
export type CronEvent = {
  readonly scheduledTime: Date;
  readonly name: string;
};

// --- Response Types ---

/**
 * Standard HTTP response shape.
 */
export type HttpResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
};

/**
 * Standard queue processing action.
 * `ack` = message processed successfully, `nack` = message should be retried.
 */
export type QueueAction =
  | { readonly action: "ack" }
  | { readonly action: "nack"; readonly reason: string };
