// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * @module @eser/logging
 *
 * A hierarchical, category-based logging system with context propagation,
 * multiple sinks, filters, and OpenTelemetry integration.
 *
 * @example Basic Usage
 * ```typescript
 * import * as logging from "@eser/logging";
 *
 * // Configure once at app startup
 * await logging.config.configure({
 *   sinks: {
 *     console: logging.sinks.getConsoleSink({
 *       formatter: logging.formatters.ansiColorFormatter()
 *     }),
 *   },
 *   loggers: [
 *     { category: ["myapp"], lowestLevel: logging.Severities.Debug, sinks: ["console"] },
 *   ],
 * });
 *
 * // Get a logger by category
 * const logger = logging.logger.getLogger(["myapp", "http"]);
 * await logger.info("Request received");
 * ```
 *
 * @example Context Propagation
 * ```typescript
 * import * as logging from "@eser/logging";
 *
 * await logging.context.withContext({ requestId: "abc-123" }, async () => {
 *   const logger = logging.logger.getLogger(["myapp"]);
 *   await logger.info("Processing request"); // Includes requestId automatically
 * });
 * ```
 */

// ============================================================================
// NAMESPACE EXPORTS (primary API)
// ============================================================================

/** Type definitions and utilities */
export * as types from "./types.ts";

/** Category utilities for hierarchical logger organization */
export * as category from "./category.ts";

/** Configuration system - configure(), reset() */
export * as config from "./config.ts";

/** Logger class and utilities - Logger, getLogger(), DEFAULT_LEVEL */
export * as logger from "./logger.ts";

/** Context propagation - withContext(), getContext() */
export * as context from "./context.ts";

/** Sink implementations - console, stream, buffered, etc. */
export * as sinks from "./sinks.ts";

/** Filter utilities - level, category, rate limit, sampling */
export * as filters from "./filters.ts";

/** Formatter functions - JSON, text, ANSI color */
export * as formatters from "./formatters.ts";

/** OpenTelemetry integration - withSpan(), tracer */
export * as tracer from "./tracer.ts";

// ============================================================================
// TYPE RE-EXPORTS (zero runtime cost)
// ============================================================================

export type {
  Category,
  ConfigureOptions,
  Filter,
  FormatterFn,
  LoggerConfig,
  LogRecord,
  Sink,
} from "./types.ts";

// Re-export logging standards (commonly needed constants)
export { Severities, SeverityNames } from "@eser/standards/logging";
export type { Severity } from "@eser/standards/logging";
