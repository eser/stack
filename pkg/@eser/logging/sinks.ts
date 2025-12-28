// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type {
  ConsoleSinkOptions,
  Filter,
  LogRecord,
  Sink,
  StreamSinkOptions,
} from "./types.ts";
import { defaultTextFormatter, jsonFormatter } from "./formatters.ts";

/**
 * Creates a console sink that outputs to console.log/console.error.
 *
 * @example
 * const sink = getConsoleSink({ formatter: ansiColorFormatter() });
 */
export const getConsoleSink = (options: ConsoleSinkOptions = {}): Sink => {
  const { formatter = defaultTextFormatter, stderr = false } = options;

  return (record: LogRecord): void => {
    const formatted = formatter(record);

    if (stderr) {
      console.error(formatted.trimEnd());
    } else {
      console.log(formatted.trimEnd());
    }
  };
};

/**
 * Creates a stream sink that writes to a WritableStream.
 *
 * @example
 * const sink = getStreamSink(Deno.stderr, { formatter: jsonFormatter });
 */
export const getStreamSink = (
  stream: WritableStream<Uint8Array>,
  options: StreamSinkOptions = {},
): Sink => {
  const { formatter = jsonFormatter } = options;
  const encoder = new TextEncoder();

  return async (record: LogRecord): Promise<void> => {
    const writer = stream.getWriter();

    try {
      await writer.ready;
      const formatted = formatter(record);
      await writer.write(encoder.encode(formatted));
    } catch (error) {
      // Re-throw with context to avoid silent failures
      throw new Error("Stream sink write failed", { cause: error });
    } finally {
      writer.releaseLock();
    }
  };
};

/**
 * Wraps a sink with a filter. Only records passing the filter reach the sink.
 *
 * @example
 * const filteredSink = withFilter(
 *   getConsoleSink(),
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
 * Creates a sink that writes to multiple sinks.
 *
 * @example
 * const multiSink = multiplexSink(consoleSink, fileSink, remoteSink);
 */
export const multiplexSink = (...sinks: Sink[]): Sink => {
  return async (record: LogRecord): Promise<void> => {
    await Promise.all(sinks.map((sink) => sink(record)));
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
        flush();
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
 * const fcSink = fingersCrossedSink(consoleSink, {
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
  const { triggerLevel = 3, maxBufferSize = 1000 } = options; // Default: Error level
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

    // Check if this record triggers the flush
    if (record.severity <= triggerLevel) {
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
 * Creates a sink that does nothing (for testing or disabling logging).
 */
export const nullSink: Sink = (_record: LogRecord): void => {
  // Intentionally empty
};

/**
 * Creates a sink that collects records into an array (for testing).
 *
 * @example
 * const { sink, records } = getTestSink();
 * // ... log some messages
 * expect(records).toHaveLength(3);
 */
export const getTestSink = (): { sink: Sink; records: LogRecord[] } => {
  const records: LogRecord[] = [];

  const sink: Sink = (record: LogRecord): void => {
    records.push(record);
  };

  return { sink, records };
};

/**
 * Creates a sink that calls a callback for each record.
 *
 * @example
 * const sink = getCallbackSink((record) => {
 *   sendToExternalService(record);
 * });
 */
export const getCallbackSink = (
  callback: (record: LogRecord) => void | Promise<void>,
): Sink => {
  return callback;
};

// Re-export types
export type { ConsoleSinkOptions, Sink, StreamSinkOptions } from "./types.ts";
