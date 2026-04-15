// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Inline RSC Emitter
 *
 * Transforms RSC wire format into inline <script> tags that can be
 * embedded directly in the HTML stream. This allows true progressive
 * RSC streaming without a separate /rsc fetch.
 *
 * @see https://github.com/facebook/react/tree/main/packages/react-server-dom-webpack
 */

import type { ReactElement } from "react";
import { parseChunk, type RSCChunk } from "@eserstack/laroux-react/protocol";
import {
  type BundlerConfig,
  renderToReadableStream as renderRSCToStream,
} from "./rsc-flight-renderer.ts";
import * as logging from "@eserstack/logging";

const inlineLogger = logging.logger.getLogger([
  "laroux-server",
  "react",
  "inline-rsc",
]);

/**
 * Chunk callback function type for inline chunk emission
 */
export type InlineChunkCallback = (chunk: RSCChunk) => void;

/**
 * Transform RSC wire format to inline script format
 *
 * Input (wire format):  J0:{"value":"test"}\n
 * Output (inline):      <script>self.__RSC_CHUNK__({type:"J",id:0,value:{"value":"test"}})</script>\n
 */
export function chunkToInlineScript(line: string): string {
  const chunk = parseChunk(line.trim());
  if (!chunk) return "";

  // Create the inline script that calls the global chunk handler
  // The chunk is passed as a structured object for easier client-side processing
  const chunkJson = JSON.stringify(chunk);
  return `<script>self.__RSC_CHUNK__(${chunkJson})</script>\n`;
}

/**
 * Create a TransformStream that converts RSC wire format to inline scripts
 *
 * This transforms the raw RSC stream into HTML-embeddable script tags.
 * Each chunk becomes a <script> that calls self.__RSC_CHUNK__()
 */
export function createInlineTransformStream(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new TransformStream({
    transform(chunk, controller) {
      // Decode and add to buffer
      buffer += decoder.decode(chunk, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      // Keep the last potentially incomplete line in buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        const inlineScript = chunkToInlineScript(line);
        if (inlineScript) {
          controller.enqueue(encoder.encode(inlineScript));
        }
      }
    },
    flush(controller) {
      // Process any remaining content
      if (buffer.trim()) {
        const inlineScript = chunkToInlineScript(buffer);
        if (inlineScript) {
          controller.enqueue(encoder.encode(inlineScript));
        }
      }
    },
  });
}

/**
 * Create an inline RSC stream from a React element
 *
 * This function:
 * 1. Renders the React element using the existing RSC Flight renderer
 * 2. Transforms the wire format output to inline <script> tags
 * 3. Returns a stream that can be piped into HTML response
 *
 * @param element - The root React element to render
 * @param bundlerConfig - Module map for client component resolution
 * @returns ReadableStream of inline script tags
 */
export function createInlineRSCStream(
  element: ReactElement,
  bundlerConfig: BundlerConfig,
): ReadableStream<Uint8Array> {
  inlineLogger.debug("Creating inline RSC stream...");

  // Use the existing RSC Flight renderer
  const rscStream = renderRSCToStream(element, bundlerConfig);

  // Transform wire format to inline scripts
  const transformStream = createInlineTransformStream();
  return rscStream.pipeThrough(transformStream);
}

/**
 * Generate the bootstrap script that buffers inline RSC chunks
 *
 * This script must be placed BEFORE any RSC chunk scripts in the HTML.
 * It sets up:
 * 1. A buffer array for chunks that arrive before JS loads
 * 2. A handler function that stores chunks in the buffer
 *
 * The client entry.tsx will later process buffered chunks and
 * replace the handler with a direct processor.
 */
export function generateInlineBootstrapScript(): string {
  return `<script id="__RSC_INLINE_BOOTSTRAP__">
self.__RSC_CHUNKS_BUFFER__=[];
self.__RSC_CHUNK__=function(c){self.__RSC_CHUNKS_BUFFER__.push(c)};
</script>`;
}

/**
 * Generate the completion marker script
 *
 * This script is placed AFTER all RSC chunks to signal completion.
 * The client uses this to know when all chunks have been received.
 */
export function generateInlineCompletionScript(): string {
  return `<script>self.__RSC_STREAMING_COMPLETE__=true</script>`;
}
