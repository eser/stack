// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Go-backed structured logger.
 *
 * Provides a simple logger handle that delegates to the native Go library
 * via EserAjanLogCreate / EserAjanLogWrite / EserAjanLogClose. Falls back
 * silently when the native library is unavailable.
 *
 * @module
 */

import * as ffiClient from "./ffi-client.ts";
import * as serialize from "./serialize.ts";

/** A level the Go logger accepts. */
export type GoLogLevel = "debug" | "info" | "warn" | "error";

/** Options for `createGoLogger()`, passed to the Go library as they are. */
export type GoLoggerOptions = {
  /** The scope name written with each entry */
  readonly scopeName?: string;
  /** The lowest level the logger writes */
  readonly level?: GoLogLevel;
  /** The output format of each entry */
  readonly format?: "json" | "text";
  /** Whether each entry carries the source location */
  readonly addSource?: boolean;
};

/** A handle to a logger in the Go library. */
export type GoLogger = {
  /** Write a log entry. */
  write(
    level: GoLogLevel,
    message: string,
    attrs?: Record<string, unknown>,
  ): void;
  /** Release the Go handle. */
  close(): void;
};

/**
 * Creates a Go-backed structured logger writing to stderr.
 *
 * If the native library is unavailable, returns a no-op logger.
 *
 * @param options - Logger configuration
 * @returns A GoLogger handle
 *
 * @example
 * ```typescript
 * import * as goLogger from "@eserstack/logging/go-logger";
 *
 * const log = await goLogger.createGoLogger({ scopeName: "myapp", level: "info" });
 * log.write("info", "Server started", { port: 8080 });
 * log.close();
 * ```
 */
export const createGoLogger = async (
  options: GoLoggerOptions = {},
): Promise<GoLogger> => {
  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    // No-op fallback
    return {
      write: () => {},
      close: () => {},
    };
  }

  const raw = lib.symbols.EserAjanLogCreate(JSON.stringify(options));
  const result = JSON.parse(raw) as { handle: string; error?: string };

  if (result.error !== undefined && result.error !== "") {
    return { write: () => {}, close: () => {} };
  }

  const handle = result.handle;

  return {
    write(
      level: GoLogLevel,
      message: string,
      attrs?: Record<string, unknown>,
    ): void {
      const lib2 = ffiClient.getLib();
      if (lib2 === null) return;
      lib2.symbols.EserAjanLogWrite(
        JSON.stringify(
          { handle, level, message, attrs },
          serialize.jsonReplacer,
        ),
      );
    },

    close(): void {
      const lib2 = ffiClient.getLib();
      if (lib2 === null) return;
      lib2.symbols.EserAjanLogClose(JSON.stringify({ handle }));
    },
  };
};
