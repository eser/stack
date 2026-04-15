// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as streams from "@eserstack/streams";
import type { Filter, LogRecord, Sink } from "./types.ts";
import { spanFormatter } from "./formatters.ts";

/**
 * Creates a sink that writes log records to a @eserstack/streams Output.
 * The output handles rendering (ANSI, Markdown, plain) via its renderer.
 *
 * @example
 * import * as streams from "@eserstack/streams";
 * const out = streams.output({ renderer: streams.renderers.ansi(), sink: streams.sinks.stdout() });
 * const sink = getOutputSink(out);
 */
export const getOutputSink = (
  output: streams.Output,
  options?: { formatter?: typeof spanFormatter },
): Sink => {
  const fmt = options?.formatter ?? spanFormatter;

  return (record: LogRecord): void => {
    const spans = fmt(record);
    output.writeln(...spans);
  };
};

/**
 * Wraps a sink with a filter. Only records passing the filter reach the sink.
 *
 * @example
 * const filteredSink = withFilter(
 *   getOutputSink(out),
 *   getLevelFilter(logging.Severities.Warning)
 * );
 */
export const withFilter = (sink: Sink, filter: Filter): Sink => {
  return (record: LogRecord): void | Promise<void> => {
    if (filter(record)) {
      return sink(record);
    }
  };
};

/**
 * Creates a sink that buffers records and flushes them in batches.
 *
 * @example
 * const bufferedSink = getBufferedSink(remoteSink, {
 *   maxSize: 100,
 *   flushIntervalMs: 5000
 * });
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

    if (flushTimer) {
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
          // Flush errors are already handled in the flush function
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
 * and flushes them when a high-severity log occurs.
 *
 * @example
 * const fcSink = fingersCrossedSink(outputSink, {
 *   triggerLevel: logging.Severities.Error,
 *   maxBufferSize: 1000
 * });
 */
export const fingersCrossedSink = (
  sink: Sink,
  options: {
    triggerLevel?: number;
    maxBufferSize?: number;
  } = {},
): Sink & { flush: () => Promise<void>; clear: () => void } => {
  const { triggerLevel = 17, maxBufferSize = 1000 } = options; // Default: Error level (OpenTelemetry)
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
 * const { sink, records } = getRecordCollectorSink();
 * // ... log some messages
 * expect(records).toHaveLength(3);
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
 * @deprecated Use `getRecordCollectorSink()` instead.
 */
export const getTestSink = getRecordCollectorSink;

// Re-export types
export type { Sink } from "./types.ts";
