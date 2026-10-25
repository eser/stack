// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as logging from "@eserstack/standards/logging";
import type * as streams from "@eserstack/streams";
import type { Filter, LogRecord, Sink } from "./types.ts";
import * as formatters from "./formatters.ts";

/**
 * Creates a sink that writes log records to a @eserstack/streams Output.
 * The output handles rendering (ANSI, Markdown, plain) via its renderer.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 * import * as streams from "@eserstack/streams";
 *
 * const out = streams.output({
 *   renderer: streams.renderers.ansi(),
 *   sink: streams.sinks.stdout(),
 * });
 * const sink = logging.sinks.getOutputSink(out);
 * ```
 */
export const getOutputSink = (
  output: streams.Output,
  options?: { formatter?: typeof formatters.spanFormatter },
): Sink => {
  const fmt = options?.formatter ?? formatters.spanFormatter;

  return (record: LogRecord): void => {
    const spans = fmt(record);
    output.writeln(...spans);
  };
};

/**
 * Wraps a sink with a filter. Only records passing the filter reach the sink.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * const { sink } = logging.sinks.getRecordCollectorSink();
 * const warningsOnly = logging.sinks.withFilter(
 *   sink,
 *   logging.filters.getLevelFilter(logging.Severities.Warning),
 * );
 * ```
 */
export const withFilter = (sink: Sink, filter: Filter): Sink => {
  return (record: LogRecord): void | Promise<void> => {
    if (filter(record)) {
      return sink(record);
    }
  };
};

/**
 * Creates a sink that buffers records and passes them to `sink` in batches:
 * when `maxSize` records are waiting (100 by default), or `flushIntervalMs`
 * after the first waiting record (5000 by default). `flush()` passes the
 * waiting records on at once; call it before the process exits.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * const { sink } = logging.sinks.getRecordCollectorSink();
 * const buffered = logging.sinks.getBufferedSink(sink, {
 *   maxSize: 50,
 *   flushIntervalMs: 1000,
 * });
 *
 * await buffered.flush();
 * ```
 */
export const getBufferedSink = (
  sink: Sink,
  options: {
    maxSize?: number;
    flushIntervalMs?: number;
  } = {},
): Sink & { flush: () => Promise<void> } => {
  const { maxSize = 100, flushIntervalMs = 5000 } = options;
  let buffer: LogRecord[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) {
      return;
    }

    const toFlush = buffer;
    buffer = [];

    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    await Promise.all(toFlush.map((record) => sink(record)));
  };

  const scheduleFlush = (): void => {
    if (flushTimer === null) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush().catch(() => {
          // A timed flush has no caller to report a sink failure to, and
          // logging the failure would feed it back into this sink, so the
          // batch is dropped. Call flush() to receive the error instead.
        });
      }, flushIntervalMs);
    }
  };

  const bufferedSink = async (record: LogRecord): Promise<void> => {
    buffer.push(record);

    if (buffer.length >= maxSize) {
      await flush();
    } else {
      scheduleFlush();
    }
  };

  bufferedSink.flush = flush;

  return bufferedSink;
};

/**
 * Creates a "fingers crossed" sink that buffers low-severity logs
 * and flushes them when a high-severity log occurs. After that, records pass
 * straight through until `clear()` starts buffering again. The buffer keeps
 * the latest `maxBufferSize` records (1000 by default), and the trigger level
 * defaults to Error.
 *
 * @example
 * ```typescript
 * import * as logging from "@eserstack/logging";
 *
 * const { sink } = logging.sinks.getRecordCollectorSink();
 * const onError = logging.sinks.fingersCrossedSink(sink, {
 *   triggerLevel: logging.Severities.Error,
 *   maxBufferSize: 500,
 * });
 * ```
 */
export const fingersCrossedSink = (
  sink: Sink,
  options: {
    triggerLevel?: number;
    maxBufferSize?: number;
  } = {},
): Sink & { flush: () => Promise<void>; clear: () => void } => {
  const { triggerLevel = logging.Severities.Error, maxBufferSize = 1000 } =
    options;
  let buffer: LogRecord[] = [];
  let triggered = false;

  const flush = async (): Promise<void> => {
    const toFlush = buffer;
    buffer = [];
    triggered = true;

    await Promise.all(toFlush.map((record) => sink(record)));
  };

  const clear = (): void => {
    buffer = [];
    triggered = false;
  };

  const fcSink = async (record: LogRecord): Promise<void> => {
    // If already triggered, pass through directly
    if (triggered) {
      await sink(record);
      return;
    }

    // Check if this record triggers the flush (higher = more severe in OpenTelemetry)
    if (record.severity >= triggerLevel) {
      buffer.push(record);
      await flush();
      return;
    }

    // Buffer the record
    buffer.push(record);

    // Evict oldest if buffer is full
    if (buffer.length > maxBufferSize) {
      buffer.shift();
    }
  };

  fcSink.flush = flush;
  fcSink.clear = clear;

  return fcSink;
};

/**
 * Creates a sink that collects LogRecords into an array (for testing).
 *
 * @example
 * ```typescript
 * import * as assert from "@std/assert";
 * import * as logging from "@eserstack/logging";
 *
 * const { sink, records } = logging.sinks.getRecordCollectorSink();
 * await logging.config.configure({
 *   sinks: { test: sink },
 *   loggers: [{ category: ["app"], sinks: ["test"] }],
 *   reset: true,
 * });
 *
 * await logging.logger.getLogger(["app"]).warn("disk almost full");
 * assert.assertEquals(records[0]?.message, "disk almost full");
 * ```
 */
export const getRecordCollectorSink = (): {
  sink: Sink;
  records: LogRecord[];
} => {
  const records: LogRecord[] = [];

  const sink: Sink = (record: LogRecord): void => {
    records.push(record);
  };

  return { sink, records };
};

/**
 * Creates a sink that collects LogRecords into an array (for testing).
 *
 * @deprecated Use `getRecordCollectorSink()` instead.
 */
export const getTestSink: typeof getRecordCollectorSink =
  getRecordCollectorSink;

// Re-export types
export type { Sink } from "./types.ts";
