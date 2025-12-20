// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import {
  type Span,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";

/**
 * @module @eser/logging
 *
 * OpenTelemetry integration for the eser stack.
 * Provides tracer setup, span utilities, and error recording for distributed tracing.
 *
 * @example
 * ```typescript
 * import * as logging from "@eser/logging";
 *
 * // Automatic span management
 * const result = await logging.tracer.withSpan("my-operation", async (span) => {
 *   span.setAttribute("key", "value");
 *   return await doSomething();
 * });
 *
 * // Manual span management
 * const span = logging.tracer.tracer.startSpan("manual-operation");
 * try {
 *   // ... operation code
 * } catch (error) {
 *   logging.tracer.recordSpanError(span, error);
 *   throw error;
 * } finally {
 *   span.end();
 * }
 * ```
 */

/**
 * Default tracer instance for the @eser/logging package.
 * Uses the package name for identification in distributed tracing.
 */
export const tracer: Tracer = trace.getTracer("@eser/logging");

/**
 * Records an error on a span with appropriate status and exception details.
 * Handles both Error instances and non-Error values gracefully.
 *
 * @param span - The OpenTelemetry span to record the error on
 * @param error - The error to record (can be Error instance or any value)
 *
 * @example
 * ```typescript
 * const span = tracer.startSpan("my-operation");
 * try {
 *   // ... operation code
 * } catch (error) {
 *   recordSpanError(span, error);
 *   throw error;
 * } finally {
 *   span.end();
 * }
 * ```
 */
export const recordSpanError = (span: Span, error: unknown): void => {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  } else {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: String(error),
    });
  }
};

/**
 * Creates a child tracer with a specific name while maintaining version consistency.
 *
 * @param name - The name for the child tracer
 * @returns A new Tracer instance with the specified name
 */
export const createTracer = (name: string, version?: string): Tracer => {
  return trace.getTracer(name, version);
};

/**
 * Wraps an async function with automatic span creation and error handling.
 *
 * @param name - The name for the span
 * @param fn - The async function to wrap
 * @returns The result of the wrapped function
 *
 * @example
 * ```typescript
 * const result = await withSpan("fetch-user", async (span) => {
 *   span.setAttribute("user.id", userId);
 *   return await fetchUser(userId);
 * });
 * ```
 */
export const withSpan = async <T>(
  name: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> => {
  const span = tracer.startSpan(name);
  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    recordSpanError(span, error);
    throw error;
  } finally {
    span.end();
  }
};

// Re-export commonly used OpenTelemetry types and utilities
export {
  type Context,
  context,
  propagation,
  type Span,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";
