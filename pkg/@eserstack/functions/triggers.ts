// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Standard trigger event types for multi-source function invocation.
 *
 * These types represent the data shape provided by different invocation
 * sources (HTTP, queue, CLI, cron, AI tool calls). They are used with
 * `Adapter` from `handler.ts` to transform trigger-specific events into
 * handler input.
 *
 * ### Supported Triggers
 *
 * | Source | Event Type | Response Type |
 * |---|---|---|
 * | HTTP (API Gateway, Deno.serve, Hono) | `HttpEvent` | `HttpResponse` |
 * | Queue (SQS, Kafka, BullMQ) | `QueueEvent` | `QueueAction` |
 * | CLI (command-line) | `CliEvent` | — (use `CliResult` from `@eserstack/shell/args`) |
 * | Cron (scheduled) | `CronEvent` | — |
 * | AI Tool Call (Claude, OpenAI, MCP, LangChain) | `ToolCallEvent` | `ToolCallResponse` |
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

// --- AI Tool Call Types ---

/**
 * AI tool call event — triggered when an LLM invokes a function as a tool.
 *
 * Compatible with Claude tool use, OpenAI function calling, MCP tools,
 * LangChain/LangGraph, Pydantic AI, and similar frameworks.
 *
 * Field naming aligns with Go `aifx` package (`ToolCall` struct in
 * `apps/services/pkg/eser-go/aifx/messages.go`).
 *
 * ```ts
 * import * as handler from "@eserstack/functions/handler";
 * import type { ToolCallEvent } from "@eserstack/functions/triggers";
 *
 * const fromToolCall: handler.Adapter<ToolCallEvent, OrderInput> = (event) => {
 *   const args = event.arguments as { customerId: string } | null;
 *   if (args?.customerId === undefined) {
 *     return results.fail(handler.adaptError("Missing customerId"));
 *   }
 *   return results.ok({ customerId: args.customerId });
 * };
 * ```
 */
export type ToolCallEvent = {
  /** Tool/function name the model called */
  readonly name: string;
  /** Parsed JSON arguments provided by the model */
  readonly arguments: unknown;
  /** Tool call ID for response correlation (provider-specific) */
  readonly callId?: string;
};

/**
 * Response returned to the model after tool execution.
 *
 * ```ts
 * const toToolResponse: handler.ResponseMapper<
 *   Order, OrderError | handler.AdaptError, ToolCallResponse
 * > = (result) => {
 *   if (results.isOk(result)) {
 *     return { content: result.value };
 *   }
 *   return { content: { error: result.error }, isError: true };
 * };
 * ```
 */
export type ToolCallResponse = {
  /** Result data to return to the model */
  readonly content: unknown;
  /** Whether this response represents an error (default: false) */
  readonly isError?: boolean;
};
