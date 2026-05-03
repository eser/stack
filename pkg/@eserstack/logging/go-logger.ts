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

import { ensureLib, getLib } from "./ffi-client.ts";

export type GoLogLevel = "debug" | "info" | "warn" | "error";

export type GoLoggerOptions = {
  readonly scopeName?: string;
  readonly level?: GoLogLevel;
  readonly format?: "json" | "text";
  readonly addSource?: boolean;
};

export type GoLogger = {
  /** Write a log entry. */
  write(level: GoLogLevel, message: string, attrs?: Record<string, unknown>): void;
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
 * import { createGoLogger } from "@eserstack/logging/go-logger";
 *
 * const log = await createGoLogger({ scopeName: "myapp", level: "info" });
 * log.write("info", "Server started", { port: 8080 });
 * log.close();
 * ```
 */
export const createGoLogger = async (
  options: GoLoggerOptions = {},
): Promise<GoLogger> => {
  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    // No-op fallback
    return {
      write: () => {},
      close: () => {},
    };
  }

  const raw = lib.symbols.EserAjanLogCreate(JSON.stringify(options));
  const result = JSON.parse(raw) as { handle: string; error?: string };

  if (result.error) {
    return { write: () => {}, close: () => {} };
  }

  const handle = result.handle;

  return {
    write(
      level: GoLogLevel,
      message: string,
      attrs?: Record<string, unknown>,
    ): void {
      const lib2 = getLib();
      if (lib2 === null) return;
      lib2.symbols.EserAjanLogWrite(
        JSON.stringify({ handle, level, message, attrs }),
      );
    },

    close(): void {
      const lib2 = getLib();
      if (lib2 === null) return;
      lib2.symbols.EserAjanLogClose(JSON.stringify({ handle }));
    },
  };
};
