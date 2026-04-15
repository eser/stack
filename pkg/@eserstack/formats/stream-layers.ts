// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as streams from "@eserstack/streams";
import * as types from "./types.ts";
import * as formatRegistry from "./format-registry.ts";

const resolveFormat = (
  formatName: string,
  registry?: types.FormatRegistry,
): types.Format => {
  const reg = registry ?? formatRegistry.formatRegistry;
  const format = reg.get(formatName);

  if (format === undefined) {
    throw new types.FormatNotFoundError(formatName);
  }

  return format;
};

/**
 * Creates a stream Layer that serializes each chunk using the specified format.
 * Each input chunk is passed through writeItem(), producing string output chunks.
 */
export const writerLayer = (
  formatName: string,
  options?: types.FormatOptions,
  registry?: types.FormatRegistry,
): streams.Layer<unknown, string> => {
  return streams.defineLayer<unknown, string>({
    name: `formats/writer(${formatName})`,
    create: () => {
      const format = resolveFormat(formatName, registry);

      return {
        start: (controller) => {
          if (format.writeStart !== undefined) {
            const header = format.writeStart(options);

            if (header.length > 0) {
              controller.enqueue(streams.createChunk(header));
            }
          }
        },
        transform: (chunk, controller) => {
          const serialized = format.writeItem(chunk.data, options);
          controller.enqueue(streams.createChunk(serialized));
        },
        flush: (controller) => {
          if (format.writeEnd !== undefined) {
            const footer = format.writeEnd(options);

            if (footer.length > 0) {
              controller.enqueue(streams.createChunk(footer));
            }
          }
        },
      };
    },
  });
};

/**
 * Creates a stream Layer that deserializes each chunk using the specified format.
 * Each input string chunk is pushed into a FormatReader, emitting parsed objects.
 */
export const readerLayer = (
  formatName: string,
  options?: types.FormatOptions,
  registry?: types.FormatRegistry,
): streams.Layer<string, unknown> => {
  return streams.defineLayer<string, unknown>({
    name: `formats/reader(${formatName})`,
    create: () => {
      const format = resolveFormat(formatName, registry);
      const reader = format.createReader(options);

      return {
        transform: (chunk, controller) => {
          const items = reader.push(chunk.data);

          for (const item of items) {
            controller.enqueue(streams.createChunk(item));
          }
        },
        flush: (controller) => {
          const remaining = reader.flush();

          for (const item of remaining) {
            controller.enqueue(streams.createChunk(item));
          }
        },
      };
    },
  });
};
