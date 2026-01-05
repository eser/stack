// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * React Flight Server - RSC Renderer for Deno
 *
 * This module implements the server-side RSC renderer that converts
 * React component trees into the RSC wire format for streaming to clients.
 *
 * The RSC wire format is a newline-delimited sequence of chunks:
 * - J chunks: JSON data (elements, props, primitives)
 * - M chunks: Module references (client components)
 * - E chunks: Errors from server rendering
 *
 * Each chunk is assigned an ID, and chunks can reference each other using
 * the $ syntax (e.g., "$42" references chunk ID 42).
 *
 * @see https://github.com/facebook/react/tree/main/packages/react-server-dom-webpack
 */

import type { ReactElement } from "react";
import {
  type createClientReference as _createClientReference,
  isClientReference,
  type ModuleReference,
  type RSCChunk,
  serializeChunk,
} from "@eser/laroux-react/protocol";
import * as logging from "@eser/logging";

const flightLogger = logging.logger.getLogger([
  "laroux-server",
  "react",
  "flight",
]);

export type BundlerConfig = {
  [moduleId: string]: ModuleReference;
};

interface RenderContext {
  bundlerConfig: BundlerConfig;
  nextId: number;
  chunks: RSCChunk[];
  pendingChunks: Map<number, Promise<void>>;
  emitChunk?: (chunk: RSCChunk) => void;
}

/**
 * Add a chunk to the context and emit it to the stream
 *
 * Chunks are emitted as they're created for true streaming behavior.
 * The emission is fire-and-forget (not awaited) since chunk creation
 * is synchronous and doesn't need to wait for network I/O.
 */
function addChunk(context: RenderContext, chunk: RSCChunk): void {
  context.chunks.push(chunk);
  context.emitChunk?.(chunk);
}

/**
 * Render a React element tree to RSC chunks
 *
 * This is the core rendering function that recursively traverses the React tree
 * and emits chunks for each node. It handles:
 * - Primitives (null, strings, numbers, booleans)
 * - Arrays
 * - Client component references
 * - Server components (function components)
 * - Built-in elements (div, span, etc.)
 * - React symbols (Suspense, Fragment, etc.)
 * - Async components (Promises)
 *
 * @param element The React element or value to render
 * @param context The render context with chunk buffer and config
 * @returns Promise resolving to the chunk ID for this element
 */
async function renderElement(
  // deno-lint-ignore no-explicit-any
  element: any,
  context: RenderContext,
): Promise<number> {
  // Null/undefined → JSON chunk with null
  if (element === null || element === undefined) {
    const id = context.nextId++;
    addChunk(context, { type: "J", id, value: null });
    return id;
  }

  // Primitives → JSON chunk with value
  if (typeof element !== "object") {
    const id = context.nextId++;
    addChunk(context, { type: "J", id, value: element });
    return id;
  }

  // Arrays → render each item, return array of chunk IDs
  if (Array.isArray(element)) {
    const id = context.nextId++;
    const arrayPromises = element.map((item) => renderElement(item, context));
    const arrayIds = await Promise.all(arrayPromises);
    addChunk(context, { type: "J", id, value: arrayIds });
    return id;
  }

  // Client component references → module chunk
  if (isClientReference(element)) {
    const id = context.nextId++;
    const moduleId = element.$$id;
    const moduleRef = context.bundlerConfig[moduleId];

    if (moduleRef) {
      addChunk(context, { type: "M", id, value: moduleRef });
    } else {
      // Fallback for missing bundler config entry
      addChunk(context, {
        type: "M",
        id,
        value: { id: moduleId, chunks: ["client"], name: "default" },
      });
    }
    return id;
  }

  // React elements - the main case we're handling
  // Check for both transitional (React 19 RSC) and standard element symbols
  const isReactElement =
    element.$$typeof === Symbol.for("react.transitional.element") ||
    element.$$typeof === Symbol.for("react.element");
  if (isReactElement) {
    const { type, props } = element;

    // Client component (type is a client reference object)
    if (type !== null && typeof type === "object" && isClientReference(type)) {
      const moduleId = type.$$id;
      const moduleRef = context.bundlerConfig[moduleId];

      flightLogger.debug(`Client reference detected: ${moduleId}`);
      flightLogger.debug(`Module ref found: ${!!moduleRef}`);
      if (!moduleRef) {
        flightLogger.debug(
          `Available keys: ${Object.keys(context.bundlerConfig).join(", ")}`,
        );
      }

      if (moduleRef) {
        const id = context.nextId++;
        const moduleChunkId = context.nextId++;
        const propsId = await renderProps(props, context);

        // Emit module reference chunk
        // Use the export name from the client reference, not from bundler config
        const exportName = moduleRef.name ?? "default";
        addChunk(context, {
          type: "M",
          id: moduleChunkId,
          value: { ...moduleRef, name: exportName },
        });

        // Emit element chunk that references the module and props
        addChunk(context, {
          type: "J",
          id,
          value: {
            $$typeof: "react.element",
            type: `$M${moduleChunkId}`,
            props: `$${propsId}`,
          },
        });

        return id;
      }
    }

    // ForwardRef component - unwrap and call render function
    if (
      type !== null &&
      typeof type === "object" &&
      type.$$typeof === Symbol.for("react.forward_ref") &&
      typeof type.render === "function"
    ) {
      try {
        const result = type.render(props, null);
        return await renderElement(result, context);
      } catch (error) {
        const id = context.nextId++;
        addChunk(context, {
          type: "E",
          id,
          value: { message: error.message, stack: error.stack },
        });
        return id;
      }
    }

    // Memo component - unwrap and render inner type
    if (
      type !== null &&
      typeof type === "object" &&
      type.$$typeof === Symbol.for("react.memo")
    ) {
      const innerType = type.type;
      const innerElement = { ...element, type: innerType };
      return await renderElement(innerElement, context);
    }

    // Server component (type is a function) - execute and render result
    if (typeof type === "function") {
      try {
        const result = type(props);

        // Async server component - handle Promise
        if (result instanceof Promise) {
          const id = context.nextId++;

          // DON'T emit the chunk yet - just return the ID as a placeholder
          // The chunk will be emitted when the Promise resolves
          // This allows the parent tree to reference this ID before it's ready

          // Track completion promise to ensure stream doesn't close early
          const completionPromise = result
            .then(async (resolved) => {
              const resolvedId = await renderElement(resolved, context);
              // NOW emit the chunk that resolves the forward reference
              addChunk(context, { type: "J", id, value: `$${resolvedId}` });
              // Remove from pending chunks after completion
              context.pendingChunks.delete(id);
            })
            .catch((error) => {
              addChunk(context, {
                type: "E",
                id,
                value: { message: error.message, stack: error.stack },
              });
              // Remove from pending chunks after error
              context.pendingChunks.delete(id);
            });

          context.pendingChunks.set(id, completionPromise);
          return id;
        }

        // Sync server component - render result directly
        return await renderElement(result, context);
      } catch (error) {
        const id = context.nextId++;
        addChunk(context, {
          type: "E",
          id,
          value: { message: error.message, stack: error.stack },
        });
        return id;
      }
    }

    // Built-in HTML elements (div, span, etc.)
    if (typeof type === "string") {
      const id = context.nextId++;
      const propsId = await renderProps(props, context);

      addChunk(context, {
        type: "J",
        id,
        value: {
          $$typeof: "react.element",
          type,
          props: `$${propsId}`,
        },
      });

      return id;
    }

    // React built-in symbols (Suspense, Fragment, etc.)
    if (typeof type === "symbol") {
      const id = context.nextId++;
      const propsId = await renderProps(props, context);

      // Serialize symbol as string - client will reconstruct it
      const typeStr = type.toString(); // e.g., "Symbol(react.suspense)"

      addChunk(context, {
        type: "J",
        id,
        value: {
          $$typeof: "react.element",
          type: typeStr,
          props: `$${propsId}`,
        },
      });

      return id;
    }
  }

  // Fallback for unhandled types - try JSON serialization
  const id = context.nextId++;
  try {
    addChunk(context, { type: "J", id, value: element });
  } catch {
    // Can't serialize - emit null
    addChunk(context, { type: "J", id, value: null });
  }
  return id;
}

/**
 * Render props object
 *
 * Props are rendered as a separate chunk to allow sharing props between elements.
 * Special handling for:
 * - children: Rendered as separate chunks and referenced with $ syntax
 * - functions: Skipped (can't be serialized, e.g., event handlers)
 * - other values: Inlined directly (strings, numbers, objects, etc.)
 *
 * @param props The props object to render
 * @param context The render context
 * @returns Promise resolving to the chunk ID for the props
 */
async function renderProps(
  // deno-lint-ignore no-explicit-any
  props: any,
  context: RenderContext,
): Promise<number> {
  if (!props || typeof props !== "object") {
    const id = context.nextId++;
    addChunk(context, { type: "J", id, value: props });
    return id;
  }

  const id = context.nextId++;
  // deno-lint-ignore no-explicit-any
  const renderedProps: any = {};

  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "fallback") {
      // Children and fallback are React elements - render as chunks and reference them
      if (Array.isArray(value)) {
        const childIds = await Promise.all(
          value.map((child) => renderElement(child, context)),
        );
        renderedProps[key] = childIds.map((childId) => `$${childId}`);
      } else if (
        value !== null && typeof value === "object" && "$$typeof" in value
      ) {
        // It's a React element - render it
        const childId = await renderElement(value, context);
        renderedProps[key] = `$${childId}`;
      } else {
        // Not a React element - inline it
        renderedProps[key] = value;
      }
    } else if (typeof value === "function") {
      // Skip functions - they can't be serialized
      continue;
    } else {
      // Inline other values directly
      renderedProps[key] = value;
    }
  }

  addChunk(context, { type: "J", id, value: renderedProps });
  return id;
}

/**
 * Render a React tree to RSC wire format stream
 *
 * This is the main server-side entry point. It:
 * 1. Creates a ReadableStream for the RSC wire format
 * 2. Starts rendering the React tree (which emits chunks)
 * 3. Waits for all async components to complete
 * 4. Closes the stream when everything is done
 *
 * Chunks are emitted as they're created for true streaming behavior.
 * The stream stays open until all async components (Suspense boundaries) resolve.
 *
 * @param element The root React element (or primitive value, array, etc.) to render
 * @param bundlerConfig Mapping of client component IDs to module references
 * @returns ReadableStream of RSC wire format (newline-delimited chunks)
 */
export function renderToReadableStream(
  // deno-lint-ignore no-explicit-any
  element: ReactElement | any,
  bundlerConfig: BundlerConfig,
): ReadableStream<Uint8Array> {
  const context: RenderContext = {
    bundlerConfig,
    nextId: 0,
    chunks: [],
    pendingChunks: new Map(),
  };

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let streamClosed = false;

  // Setup chunk emission before rendering starts
  context.emitChunk = (chunk: RSCChunk) => {
    if (streamClosed || !controller) return;

    const line = serializeChunk(chunk);

    try {
      const bytes = new TextEncoder().encode(line);
      controller.enqueue(bytes);
    } catch (error) {
      if (!streamClosed) {
        flightLogger.error(`Error emitting chunk ${chunk.id}: ${error}`);
        streamClosed = true;
      }
    }
  };

  // Rendering logic - starts when stream is first pulled
  let renderingStarted = false;
  const startRendering = () => {
    if (renderingStarted) return;
    renderingStarted = true;

    flightLogger.debug("Starting RSC render...");

    (async () => {
      try {
        // Start rendering the root element in the background
        // This returns the root chunk ID but doesn't wait for async children
        const rootIdPromise = renderElement(element, context);

        flightLogger.debug(
          "Root rendering started, emitting root chunk next...",
        );

        // Wait for root chunk ID and emit it
        const rootId = await rootIdPromise;

        flightLogger.debug(
          `Root chunk ID: ${rootId}, pending async: ${context.pendingChunks.size}`,
        );

        // Wait for all async components (Suspense boundaries)
        // Use a loop to handle nested async components - when one resolves,
        // it might create more pending chunks that also need to be awaited
        while (context.pendingChunks.size > 0) {
          flightLogger.debug(
            `Waiting for ${context.pendingChunks.size} async component(s)...`,
          );
          await Promise.all(context.pendingChunks.values());
        }
        flightLogger.debug("All async components resolved");

        flightLogger.debug(
          `All done. Closing stream. Total: ${context.chunks.length} chunks`,
        );

        // Close stream when all chunks are emitted
        if (!streamClosed && controller) {
          streamClosed = true;
          controller.close();
        }
      } catch (error) {
        flightLogger.error(`Render error: ${error}`);
        if (!streamClosed && controller) {
          streamClosed = true;
          controller.error(error);
        }
      }
    })();
  };

  // Create ReadableStream that starts rendering on first pull
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
    pull() {
      // Lazy rendering - starts when client begins reading
      startRendering();
    },
    cancel() {
      streamClosed = true;
    },
  });

  return stream;
}
