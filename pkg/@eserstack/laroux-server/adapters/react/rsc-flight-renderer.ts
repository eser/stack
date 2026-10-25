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

import * as errorChunk from "./error-chunk.ts";
import type { ReactElement } from "react";
import * as protocol from "@eserstack/laroux-react/protocol";
import type {
  createClientReference as _createClientReference,
  ModuleReference,
  RSCChunk,
  ServerReference,
} from "@eserstack/laroux-react/protocol";
import * as logging from "@eserstack/logging";

const flightLogger = logging.logger.getLogger([
  "laroux-server",
  "react",
  "flight",
]);

/**
 * A node of a React tree as the renderer walks it: an element, props,
 * children or a primitive, all produced by user components and untyped here.
 */
// oxlint-disable-next-line typescript/no-explicit-any
type TreeNode = any;

/**
 * The module map of the client bundle: for each client component's module id,
 * the chunks that hold it and its export name. The renderer writes these
 * references into M chunks, so the browser loads a client component from its
 * own chunk.
 */
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
 * Encode a number for a J chunk: the values JSON turns into null or 0
 * (NaN, the infinities and -0) get their tag.
 */
function encodeNumber(value: number): number | string {
  const tags = protocol.RSC_VALUE_TAGS;

  if (Number.isNaN(value)) return tags.nan;
  if (value === Infinity) return tags.infinity;
  if (value === -Infinity) return tags.negativeInfinity;
  if (Object.is(value, -0)) return tags.negativeZero;
  return value;
}

/**
 * Encode a primitive child of a tree for a J chunk. Strings that start with
 * "$" are escaped, and functions and symbols, which React does not render,
 * become null.
 */
function encodeChildPrimitive(value: unknown): TreeNode {
  switch (typeof value) {
    case "string":
      return protocol.escapeString(value);
    case "number":
      return encodeNumber(value);
    case "bigint":
      return `${protocol.RSC_VALUE_TAGS.bigint}${value}`;
    case "function":
    case "symbol":
      return null;
    default:
      return value;
  }
}

/**
 * Emit the S chunk of a server action and return the reference to it.
 */
function encodeServerReference(
  value: ServerReference,
  context: RenderContext,
): string {
  const actionChunkId = context.nextId++;
  addChunk(context, {
    type: "S",
    id: actionChunkId,
    value: { id: value.$$id, bound: value.$$bound },
  });
  return `$F${actionChunkId}`;
}

/**
 * Encode a value for a J chunk the way laroux-react's
 * createValueFromReadableStream decodes it.
 *
 * JSON values arrive the same and strings that start with "$" are escaped.
 * Dates, BigInts, undefined and non-finite numbers get a tag, and Maps and
 * Sets a chunk of their entries (protocol.RSC_VALUE_TAGS). React elements are
 * rendered like a page tree and server actions become references. Other
 * objects are encoded the way JSON.stringify encodes them: through their
 * toJSON method when they have one, else their own enumerable properties.
 *
 * @param path Where the value sits, for the message of an unsupported value
 * @param ancestors The objects that contain the value, to find a cycle
 * @throws {TypeError} For a symbol, a promise, a function that is not a
 *   server action, or an object that contains itself, which the client cannot
 *   receive
 */
async function encodeValue(
  value: unknown,
  context: RenderContext,
  path: string,
  ancestors: ReadonlySet<object>,
): Promise<TreeNode> {
  const tags = protocol.RSC_VALUE_TAGS;

  switch (typeof value) {
    case "undefined":
      return tags.undefined;
    case "boolean":
      return value;
    case "string":
      return protocol.escapeString(value);
    case "number":
      return encodeNumber(value);
    case "bigint":
      return `${tags.bigint}${value}`;
    case "symbol":
      throw new TypeError(
        `encode RSC value: ${path} is a symbol, which cannot be sent to the client; send a string instead`,
      );
    case "function":
      if (protocol.isServerReference(value)) {
        return encodeServerReference(value, context);
      }
      throw new TypeError(
        `encode RSC value: ${path} is a function, which cannot be sent to the client; send data, or a server action from a "use server" file`,
      );
  }

  if (value === null) {
    return null;
  }

  // Every other type returned or threw above, so the value is an object.
  const container = value as object;
  if (ancestors.has(container)) {
    throw new TypeError(
      `encode RSC value: ${path} contains itself, which cannot be sent to the client; send a copy without the cycle`,
    );
  }
  const innerAncestors = new Set(ancestors).add(container);

  if (Array.isArray(value)) {
    return await Promise.all(
      value.map((item, index) =>
        encodeValue(item, context, `${path}[${index}]`, innerAncestors),
      ),
    );
  }

  if (protocol.isReactElement(value) || protocol.isClientReference(value)) {
    const elementId = await renderElement(value, context);
    return `$${elementId}`;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return `${tags.date}${
      Number.isNaN(time) ? "Invalid Date" : value.toISOString()
    }`;
  }

  if (value instanceof Map) {
    const id = context.nextId++;
    const entries = await Promise.all(
      [...value].map(([key, item], index) =>
        Promise.all([
          encodeValue(
            key,
            context,
            `${path}[map key ${index}]`,
            innerAncestors,
          ),
          encodeValue(
            item,
            context,
            `${path}[map value ${index}]`,
            innerAncestors,
          ),
        ]),
      ),
    );
    addChunk(context, { type: "J", id, value: entries });
    return `${tags.map}${id}`;
  }

  if (value instanceof Set) {
    const id = context.nextId++;
    const items = await Promise.all(
      [...value].map((item, index) =>
        encodeValue(
          item,
          context,
          `${path}[set value ${index}]`,
          innerAncestors,
        ),
      ),
    );
    addChunk(context, { type: "J", id, value: items });
    return `${tags.set}${id}`;
  }

  const object = value as {
    readonly then?: unknown;
    readonly toJSON?: unknown;
  };

  if (typeof object.then === "function") {
    throw new TypeError(
      `encode RSC value: ${path} is a promise, which cannot be sent to the client; await it before returning the value`,
    );
  }

  if (typeof object.toJSON === "function") {
    return await encodeValue(object.toJSON(), context, path, ancestors);
  }

  const entries = await Promise.all(
    Object.entries(object).map(
      async ([key, item]) =>
        [
          key,
          await encodeValue(item, context, `${path}.${key}`, innerAncestors),
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
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
  element: TreeNode,
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
    addChunk(context, { type: "J", id, value: encodeChildPrimitive(element) });
    return id;
  }

  // Arrays → render each item, return array of references to their chunks
  if (Array.isArray(element)) {
    const id = context.nextId++;
    const arrayPromises = element.map((item) => renderElement(item, context));
    const arrayIds = await Promise.all(arrayPromises);
    addChunk(context, {
      type: "J",
      id,
      value: arrayIds.map((itemId) => `$${itemId}`),
    });
    return id;
  }

  // Client component references → module chunk
  if (protocol.isClientReference(element)) {
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
    if (
      type !== null &&
      typeof type === "object" &&
      protocol.isClientReference(type)
    ) {
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
        // Handled here: logged once, and the client receives the error chunk
        // in place of the component.
        const id = context.nextId++;
        flightLogger
          .with({ error })
          .error(
            "render RSC: a forwardRef component threw; sent an error chunk in its place",
          );
        addChunk(context, {
          type: "E",
          id,
          value: errorChunk.toClientErrorValue(error),
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
              flightLogger
                .with({ error })
                .error(
                  "render RSC: an async server component rejected; sent an error chunk in its place",
                );
              addChunk(context, {
                type: "E",
                id,
                value: errorChunk.toClientErrorValue(error),
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
        // Handled here: logged once, and the client receives the error chunk
        // in place of the component.
        const id = context.nextId++;
        flightLogger
          .with({ error })
          .error(
            "render RSC: a server component threw; sent an error chunk in its place",
          );
        addChunk(context, {
          type: "E",
          id,
          value: errorChunk.toClientErrorValue(error),
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

  // Other objects keep JSON semantics, as client component props do
  const id = context.nextId++;
  let value: TreeNode;
  try {
    value = protocol.encodeJsonValue(element) ?? null;
  } catch (error) {
    // Handled here: React cannot render the object either, so the child
    // renders as nothing and the render goes on.
    flightLogger
      .with({ error })
      .warn(
        "render RSC: a child object cannot be encoded as JSON; rendering null in its place",
      );
    value = null;
  }
  addChunk(context, { type: "J", id, value });
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
  props: TreeNode,
  context: RenderContext,
): Promise<number> {
  if (!props || typeof props !== "object") {
    const id = context.nextId++;
    addChunk(context, { type: "J", id, value: props });
    return id;
  }

  const id = context.nextId++;
  const renderedProps: Record<string, TreeNode> = {};

  // Props render one at a time: renderElement takes ids from the shared
  // context counter, so prop order fixes the chunk ids and their emit order.
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "fallback") {
      // Children and fallback are React elements - render as chunks and reference them
      if (Array.isArray(value)) {
        // Sequential across props to keep chunk ids in prop order.
        // oxlint-disable-next-line no-await-in-loop
        const childIds = await Promise.all(
          value.map((child) => renderElement(child, context)),
        );
        renderedProps[key] = childIds.map((childId) => `$${childId}`);
      } else if (
        value !== null &&
        typeof value === "object" &&
        "$$typeof" in value
      ) {
        // It's a React element - render it, in prop order like above
        // oxlint-disable-next-line no-await-in-loop
        const childId = await renderElement(value, context);
        renderedProps[key] = `$${childId}`;
      } else {
        // Not a React element - inline it
        renderedProps[key] = protocol.encodeJsonValue(value);
      }
    } else if (protocol.isServerReference(value)) {
      // Server action reference - emit S chunk with action ID
      renderedProps[key] = encodeServerReference(value, context);
    } else if (typeof value === "function") {
      // Skip regular functions - they can't be serialized
      continue;
    } else {
      // Inline other values with JSON semantics
      renderedProps[key] = protocol.encodeJsonValue(value);
    }
  }

  addChunk(context, { type: "J", id, value: renderedProps });
  return id;
}

/**
 * Create the RSC stream of one render: renderRoot adds chunk 0 and the chunks
 * it references, and the stream closes once every async server component
 * has resolved.
 *
 * Chunks are emitted as they're created for true streaming behavior, and
 * rendering starts when the stream is first pulled.
 */
function createRenderStream(
  bundlerConfig: BundlerConfig,
  renderRoot: (context: RenderContext) => Promise<void>,
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

    const line = protocol.serializeChunk(chunk);

    try {
      const bytes = new TextEncoder().encode(line);
      controller.enqueue(bytes);
    } catch (error) {
      if (!streamClosed) {
        flightLogger
          .with({ error })
          .error(`emit RSC chunk ${chunk.id}; closing the stream`);
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

    // Every failure is handled inside, so this promise never rejects.
    (async () => {
      try {
        await renderRoot(context);

        flightLogger.debug(
          `Root rendered, pending async: ${context.pendingChunks.size}`,
        );

        // Wait for all async components (Suspense boundaries)
        // Use a loop to handle nested async components - when one resolves,
        // it might create more pending chunks that also need to be awaited
        while (context.pendingChunks.size > 0) {
          flightLogger.debug(
            `Waiting for ${context.pendingChunks.size} async component(s)...`,
          );
          // Each round waits for every pending chunk at once; the loop only
          // repeats for chunks registered while the previous round resolved.
          // oxlint-disable-next-line no-await-in-loop
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
        flightLogger
          .with({ error })
          .error("render RSC stream; erroring the stream");
        if (!streamClosed && controller) {
          streamClosed = true;
          controller.error(error);
        }
      }
    })();
  };

  // Create ReadableStream that starts rendering on first pull
  return new ReadableStream<Uint8Array>({
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
  // Any value a server component tree can hold; the walk narrows it per node.
  // oxlint-disable-next-line typescript/no-explicit-any
  element: ReactElement | any,
  bundlerConfig: BundlerConfig,
): ReadableStream<Uint8Array> {
  return createRenderStream(bundlerConfig, async (context) => {
    // The root takes the first id, so it is chunk 0
    const rootId = await renderElement(element, context);
    flightLogger.debug(`Root chunk ID: ${rootId}`);
  });
}

/**
 * Render a value to the RSC wire format, as laroux-server sends a server
 * action's result.
 *
 * Chunk 0 holds the value. Unlike client component props, which keep JSON
 * semantics, it is encoded so that Dates, Maps, Sets, BigInts, `undefined`
 * and non-finite numbers arrive as themselves; the React elements in it
 * render like a page tree, and server actions arrive callable.
 * createValueFromReadableStream in `@eserstack/laroux-react/client` decodes
 * it.
 *
 * A value the client cannot receive (a symbol, a promise, a function that is
 * not a server action, or an object that contains itself) is logged, and
 * chunk 0 becomes an error chunk whose message names where it sits.
 *
 * @param value The value to send
 * @param bundlerConfig Mapping of client component IDs to module references
 * @returns ReadableStream of RSC wire format (newline-delimited chunks)
 */
export function renderValueToReadableStream(
  value: unknown,
  bundlerConfig: BundlerConfig,
): ReadableStream<Uint8Array> {
  return createRenderStream(bundlerConfig, async (context) => {
    const rootId = context.nextId++;

    try {
      const model = await encodeValue(value, context, "value", new Set());
      addChunk(context, { type: "J", id: rootId, value: model });
    } catch (error) {
      // Handled here: logged once, and the client receives the message as
      // the error of chunk 0.
      await flightLogger
        .with({ error })
        .error(
          "encode RSC value: the value cannot be sent to the client; sent an error chunk",
        );
      addChunk(context, {
        type: "E",
        id: rootId,
        value: errorChunk.toClientErrorValue(error),
      });
    }
  });
}
