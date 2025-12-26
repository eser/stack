// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { runtime } from "@eser/standards/runtime";
import type { FormatOptions, WriterInstance, WriterOptions } from "./types.ts";
import { FormatNotFoundError } from "./types.ts";
import { getFormat } from "./format-registry.ts";

let encoder: TextEncoder | undefined;
const getEncoder = (): TextEncoder => {
  if (encoder === undefined) {
    encoder = new TextEncoder();
  }
  return encoder;
};

// Trim trailing separator from output (for YAML/TOML multi-doc)
const trimTrailingSeparator = (output: string): string => {
  return output.replace(/\n(---|\+\+\+)\n$/, "\n");
};

export const writer = (opts: WriterOptions): WriterInstance => {
  const format = getFormat(opts.type);
  if (format === undefined) {
    throw new FormatNotFoundError(opts.type);
  }

  // Store serialized chunks instead of raw items (forward-only streaming)
  const chunks: string[] = [];
  let isFirst = true;
  let started = false;
  let ended = false;

  // Base options with separator hint for multi-doc formats
  const baseOptions: FormatOptions = {
    ...opts.options,
    separator: opts.options?.separator ?? "",
  };

  const getOutput = (): string => {
    if (chunks.length === 0) {
      return "";
    }
    return trimTrailingSeparator(chunks.join(""));
  };

  return {
    name: opts.name,

    start: (): void => {
      if (started) return; // idempotent
      const output = format.writeStart?.(baseOptions) ?? "";
      if (output) chunks.push(output);
      started = true;
    },

    write: (data: unknown): void => {
      // Forward-only: serialize immediately with generic _isFirst hint
      const itemOptions: FormatOptions = {
        ...baseOptions,
        _isFirst: isFirst,
        _inArray: started, // signal that start() was called (for JSON array mode)
      };
      chunks.push(format.writeItem(data, itemOptions));
      isFirst = false;
    },

    end: (): void => {
      if (ended) return; // idempotent
      const output = format.writeEnd?.(baseOptions) ?? "";
      if (output) chunks.push(output);
      ended = true;
    },

    clear: (): void => {
      chunks.length = 0;
      isFirst = true;
      started = false;
      ended = false;
    },

    string: (): string => getOutput(),

    bytes: (): Uint8Array => getEncoder().encode(getOutput()),

    readable: (): ReadableStream<string> => {
      return new ReadableStream({
        start: (controller) => {
          controller.enqueue(getOutput());
          controller.close();
        },
      });
    },

    pipeTo: async (dest: WritableStream<string>): Promise<void> => {
      const readable = new ReadableStream({
        start: (controller) => {
          controller.enqueue(getOutput());
          controller.close();
        },
      });
      await readable.pipeTo(dest);
    },

    pipeToStdout: async (): Promise<void> => {
      const bytes = getEncoder().encode(getOutput());
      const stdoutWriter = runtime.process.stdout.getWriter();
      try {
        await stdoutWriter.write(bytes);
      } finally {
        stdoutWriter.releaseLock();
      }
    },
  };
};
