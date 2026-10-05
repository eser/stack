// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Chunk, Layer, LayerDefinition } from "./types.ts";

/**
 * Creates a layer from a definition. Each use of the layer calls
 * `definition.create()`, so state in the callbacks is not shared between
 * streams.
 *
 * @param definition - The layer's name and callback factory
 * @returns The layer
 */
export const defineLayer = <I = unknown, O = unknown>(
  definition: LayerDefinition<I, O>,
): Layer<I, O> => {
  return {
    name: definition.name,
    transform: (): TransformStream<Chunk<I>, Chunk<O>> => {
      const transformer = definition.create();

      return new TransformStream<Chunk<I>, Chunk<O>>({
        start: transformer.start
          ? (controller) => transformer.start!(controller)
          : undefined,
        transform: (chunk, controller) =>
          transformer.transform(chunk, controller),
        flush: transformer.flush
          ? (controller) => transformer.flush!(controller)
          : undefined,
      });
    },
  };
};
