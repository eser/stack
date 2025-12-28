// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import {
  type Span,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";
import { withContext } from "./context.ts";

/**
 * @module @eser/logging
 *
 * OpenTelemetry integration for the eser stack.
 * Provides tracer setup, span utilities, and error recording for distributed tracing.
 * Automatically correlates trace context with logging context.
 *
 * @example
 * ```typescript
 * import * as logging from "@eser/logging";
 *
 * // Automatic span management with log correlation
 * const result = await logging.tracer.withSpan("my-operation", async (span) => {
 *   // All logs within this callback will include traceId and spanId
 *   await logging.getLogger(["myapp"]).info("Processing");
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
 * Extracts trace context from a span for logging correlation.
 */
const extractTraceContext = (
  span: Span,
): { traceId: string; spanId: string; traceFlags: number } | null => {
  const spanContext = span.spanContext();

  if (!spanContext) {
    return null;
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
};

/**
 * Wraps an async function with automatic span creation, error handling,
 * and logging context correlation.
 *
 * All logs within the callback will automatically include traceId and spanId.
 *
 * @param name - The name for the span
 * @param fn - The async function to wrap
 * @returns The result of the wrapped function
 *
 * @example
 * ```typescript
 * const result = await withSpan("fetch-user", async (span) => {
 *   span.setAttribute("user.id", userId);
 *   // This log will include traceId and spanId automatically
 *   await logger.info("Fetching user data");
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
    // Extract trace context for log correlation
    const traceContext = extractTraceContext(span);

    // Run with logging context if trace context is available
    if (traceContext) {
      const result = await withContext(traceContext, () => {
        return fn(span);
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    }

    // Fallback without context correlation
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

/**
 * Synchronous version of withSpan for non-async operations.
 *
 * @param name - The name for the span
 * @param fn - The function to wrap
 * @returns The result of the wrapped function
 */
export const withSpanSync = <T>(name: string, fn: (span: Span) => T): T => {
  const span = tracer.startSpan(name);

  try {
    // Extract trace context for log correlation
    const traceContext = extractTraceContext(span);

    // Run with logging context if trace context is available
    if (traceContext) {
      const result = withContext(traceContext, () => fn(span));
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    }

    // Fallback without context correlation
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    recordSpanError(span, error);
    throw error;
  } finally {
    span.end();
  }
};

/**
 * Creates a traced logger that automatically includes trace context.
 * Use within a withSpan callback for automatic correlation.
 *
 * @param name - The span name for the traced operation
 * @param fn - Async function to execute with tracing
 * @returns Result of the function
 */
export const traceOperation = <T>(
  name: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> => {
  return withSpan(name, fn);
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
