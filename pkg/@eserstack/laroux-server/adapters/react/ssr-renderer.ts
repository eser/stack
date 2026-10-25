// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Server-Side Rendering (SSR) Renderer
 *
 * This module renders React Server Components to HTML for initial page load.
 * It generates both:
 * 1. HTML markup for immediate display
 * 2. RSC payload for client hydration
 *
 * Key concepts:
 * - Server components are rendered to HTML directly
 * - Client components render as placeholders with data attributes
 * - RSC payload is embedded in the HTML for hydration without refetch
 */

import * as errorChunk from "./error-chunk.ts";
import * as scriptJson from "./script-json.ts";
import * as React from "react";
import * as ReactDOMServer from "react-dom/server";
import * as protocol from "@eserstack/laroux-react/protocol";
import type { RSCChunk } from "@eserstack/laroux-react/protocol";
import type { BundlerConfig } from "./rsc-flight-renderer.ts";
import * as logging from "@eserstack/logging";

const ssrLogger = logging.logger.getLogger(["laroux-server", "react", "ssr"]);

/**
 * A node of a React tree as the preprocessor walks it: an element, props,
 * children or a primitive, all produced by user components and untyped here.
 */
// deno-lint-ignore no-explicit-any
type TreeNode = any;

/**
 * Ensure all elements in an array have keys.
 * Uses cloneElement to add explicit keys only to elements that need them.
 *
 * Performance optimizations:
 * 1. Fast-path check: if all elements have keys, return original array (no allocation)
 * 2. Early termination: stops checking once we find a keyless element
 *
 * Why we need this:
 * When preprocessing creates new elements with createElement(), original keys
 * are lost because React stores keys on the element object, not in props.
 * Unlike react-server-dom-webpack which serializes to JSON and reconstructs
 * elements with proper keys on the client, we need actual React elements for
 * renderToReadableStream - hence we must ensure keys exist before rendering.
 */
function ensureArrayKeys(arr: TreeNode[]): TreeNode[] {
  // Fast-path: check if any valid React element lacks a key
  let needsProcessing = false;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    // Use isReactElement from protocol.ts for element type check
    if (protocol.isReactElement(item)) {
      // Check if key is missing
      if (item.key === null || item.key === undefined || item.key === "") {
        needsProcessing = true;
        break; // Early termination - one keyless element is enough
      }
    }
  }

  // Fast-path: no changes needed, return original array (zero allocation)
  if (!needsProcessing) {
    return arr;
  }

  // Slow-path: create new array with keys added where needed
  const result = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    // Use isReactElement from protocol.ts for element type check
    if (protocol.isReactElement(item)) {
      // Only clone if key is missing
      if (item.key === null || item.key === undefined || item.key === "") {
        result[i] = React.cloneElement(item, { key: `.${i}` });
        continue;
      }
    }
    result[i] = item;
  }
  return result;
}

/**
 * Name of a function component for logs and data attributes; anonymous
 * functions have an empty name, so they get the fallback.
 */
function componentName(
  type: { readonly name?: string },
  fallback: string,
): string {
  const name = type.name;
  return name !== undefined && name !== "" ? name : fallback;
}

/**
 * Describe an element type for debug logs
 */
function describeType(type: unknown): string {
  if (typeof type === "function") return componentName(type, "anonymous");
  if (typeof type === "string") return type;
  if (typeof type === "symbol") return type.toString();
  return "unknown";
}

/**
 * SSR rendering options
 */
export type SSROptions = {
  /** Whether to stream HTML or await all content */
  streamMode: "streaming-classic" | "await-all";
  /** Timeout for async components (ms) */
  timeout?: number;
};

/**
 * SSR rendering result
 */
export type SSRResult = {
  /** Server-rendered HTML content */
  html: string;
  /** RSC payload chunks for hydration */
  rscPayload: RSCChunk[];
  /** Client component modules that need to be loaded */
  clientModules: string[];
};

/**
 * Context for SSR rendering
 */
interface SSRContext {
  bundlerConfig: BundlerConfig;
  nextId: number;
  chunks: RSCChunk[];
  clientModules: Set<string>;
  pendingPromises: Promise<void>[];
  /** Stream mode - if "streaming-classic", don't await async components */
  streamMode: "streaming-classic" | "await-all";
  /** Track async components for deferred resolution */
  asyncComponents: Map<
    number,
    { promise: Promise<TreeNode>; fallback: TreeNode }
  >;
  /** Current Suspense fallback for async component placeholders */
  suspenseFallback: TreeNode;
}

/**
 * Create a placeholder element for client components
 * The placeholder includes data attributes for hydration
 *
 * @param moduleId - The module path (e.g., "./src/app/counter.tsx")
 * @param exportName - The export name (e.g., "Counter" or "default")
 * @param props - Component props (serializable ones only)
 * @param children - Server-rendered children (if any)
 * @param elementChunkId - RSC chunk ID for this element (for proper hydration)
 */
function createClientPlaceholder(
  moduleId: string,
  exportName: string,
  props: Record<string, unknown>,
  children: TreeNode,
  elementChunkId: number,
): TreeNode {
  // Serialize props (excluding children and functions)
  const serializableProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || typeof value === "function") continue;
    serializableProps[key] = value;
  }

  // Ensure array children have keys
  const safeChildren = Array.isArray(children)
    ? ensureArrayKeys(children)
    : children;

  // Create a div placeholder with data attributes
  // data-chunk-id links to RSC payload for proper prop/children resolution
  return React.createElement(
    "div",
    {
      "data-client-component": moduleId,
      "data-export-name": exportName,
      "data-props": JSON.stringify(serializableProps),
      "data-chunk-id": String(elementChunkId),
      style: { display: "contents" }, // Don't affect layout
    },
    safeChildren,
  );
}

/**
 * Pre-process the React tree to handle client components
 * Returns a new tree with client components replaced by placeholders
 * and collects RSC chunks for the payload
 */
async function preprocessTree(
  element: TreeNode,
  context: SSRContext,
): Promise<{ processedElement: TreeNode; chunkId: number }> {
  // Null/undefined
  if (element === null || element === undefined) {
    const id = context.nextId++;
    context.chunks.push({ type: "J", id, value: null });
    return { processedElement: null, chunkId: id };
  }

  // Primitives (string, number, boolean). The chunk escapes strings that
  // start with "$", which the client would otherwise read as references.
  if (typeof element !== "object") {
    const id = context.nextId++;
    context.chunks.push({
      type: "J",
      id,
      value: protocol.encodeJsonValue(element) ?? null,
    });
    return { processedElement: element, chunkId: id };
  }

  // Arrays - use Children.toArray to ensure all elements have keys
  if (Array.isArray(element)) {
    const id = context.nextId++;
    const processedItems = await Promise.all(
      element.map((item) => preprocessTree(item, context)),
    );
    // Use $-prefixed references for RSC protocol
    const chunkRefs = processedItems.map((r) => `$${r.chunkId}`);
    context.chunks.push({ type: "J", id, value: chunkRefs });
    const rawElements = processedItems.map((r) => r.processedElement);
    // Ensure all elements have keys
    return {
      processedElement: ensureArrayKeys(rawElements),
      chunkId: id,
    };
  }

  // Client component reference (the type itself is a reference)
  if (protocol.isClientReference(element)) {
    const id = context.nextId++;
    const moduleId = element.$$id;
    const exportName = element.name ?? "default";

    // Look up in bundler config
    const moduleRef = context.bundlerConfig[moduleId] ?? {
      id: moduleId,
      chunks: [],
      name: exportName,
    };

    context.chunks.push({ type: "M", id, value: moduleRef });
    context.clientModules.add(moduleId);

    // Return a simple placeholder reference
    return { processedElement: null, chunkId: id };
  }

  // React element (handle both standard and transitional symbols for React 19 RSC)
  if (protocol.isReactElement(element)) {
    // Extract key from element - React stores it on the element object, not in props
    const { type, props, key: originalKey } = element;

    // Debug: log what type we're processing
    ssrLogger.debug(
      `Processing React element with type: ${typeof type}, name: ${describeType(
        type,
      )}`,
    );

    // Client component element (type is a client reference)
    if (protocol.isClientReference(type)) {
      // Pre-allocate IDs so we can pass elementId to placeholder
      const moduleChunkId = context.nextId++;
      const propsChunkId = context.nextId++;
      const elementChunkId = context.nextId++;

      const moduleId = type.$$id;
      const exportName = type.name ?? "default";

      // Look up in bundler config
      const moduleRef = context.bundlerConfig[moduleId] ?? {
        id: moduleId,
        chunks: [],
        name: exportName,
      };

      context.chunks.push({ type: "M", id: moduleChunkId, value: moduleRef });
      context.clientModules.add(moduleId);

      // Process children (if any) - they might be server components
      let processedChildren = null;
      let childrenChunkId: number | undefined;
      if (props?.children) {
        const childResult = await preprocessTree(props.children, context);
        processedChildren = childResult.processedElement;
        childrenChunkId = childResult.chunkId;
      }

      // Create placeholder with processed children and element chunk ID
      // The chunk ID allows client to look up this element in RSC payload
      const placeholder = createClientPlaceholder(
        moduleId,
        exportName,
        props ?? {},
        processedChildren,
        elementChunkId,
      );

      // Create RSC props chunk for hydration
      const serializedProps: Record<string, TreeNode> = {};
      if (props !== undefined) {
        for (const [key, value] of Object.entries(props)) {
          if (typeof value === "function") continue;
          if (key === "children" && childrenChunkId !== undefined) {
            // Reference the processed children chunk
            serializedProps[key] = `$${childrenChunkId}`;
          } else if (typeof value === "object" && value !== null) {
            // Props are processed in order: preprocessTree takes chunk ids from
            // the shared context counter, so the order fixes the ids.
            // deno-lint-ignore no-await-in-loop
            const valueResult = await preprocessTree(value, context);
            serializedProps[key] = `$${valueResult.chunkId}`;
          } else {
            serializedProps[key] = protocol.encodeJsonValue(value);
          }
        }
      }
      context.chunks.push({
        type: "J",
        id: propsChunkId,
        value: serializedProps,
      });

      // Element chunk referencing the module and props
      context.chunks.push({
        type: "J",
        id: elementChunkId,
        value: {
          $$typeof: "react.element",
          type: `$M${moduleChunkId}`,
          props: `$${propsChunkId}`,
        },
      });

      return { processedElement: placeholder, chunkId: elementChunkId };
    }

    // ForwardRef component - unwrap and call render function
    if (
      type !== null &&
      typeof type === "object" &&
      type.$$typeof === Symbol.for("react.forward_ref") &&
      typeof type.render === "function"
    ) {
      try {
        ssrLogger.debug("Processing ForwardRef component");
        const result = type.render(props, null);
        return await preprocessTree(result, context);
      } catch (error) {
        ssrLogger
          .with({ error })
          .error(
            "render SSR: a forwardRef component threw; sent an error chunk in its place",
          );
        const errorId = context.nextId++;
        context.chunks.push({
          type: "E",
          id: errorId,
          value: errorChunk.toClientErrorValue(error),
        });
        return { processedElement: null, chunkId: errorId };
      }
    }

    // Memo component - unwrap and render inner type
    if (
      type !== null &&
      typeof type === "object" &&
      type.$$typeof === Symbol.for("react.memo")
    ) {
      ssrLogger.debug("Processing Memo component");
      const innerType = type.type;
      const innerElement = { ...element, type: innerType };
      return await preprocessTree(innerElement, context);
    }

    // Server component (function type)
    if (typeof type === "function") {
      try {
        ssrLogger.debug(
          `Executing server component: ${componentName(type, "anonymous")}`,
        );
        // Execute the server component
        const result = type(props);

        // Handle async components
        if (result instanceof Promise) {
          // In streaming mode, don't await AND don't track the promise
          // This prevents duplicate execution - async components only run via /rsc
          if (context.streamMode === "streaming-classic") {
            ssrLogger.debug(
              `Async server component ${componentName(
                type,
                "anonymous",
              )} skipped in SSR (streaming-classic mode) - client will fetch via /rsc`,
            );
            const id = context.nextId++;

            // Return a placeholder that will be hydrated by /rsc endpoint
            // Use the pre-processed Suspense fallback directly (no await needed)
            const fallbackContent = context.suspenseFallback ?? "Loading...";
            // Ensure array children have keys
            const safeFallback = Array.isArray(fallbackContent)
              ? ensureArrayKeys(fallbackContent)
              : fallbackContent;
            const placeholder = React.createElement("div", {
              "data-async-boundary": id,
              "data-component": componentName(type, "async"),
              children: safeFallback,
            });

            // DON'T track the promise - prevents execution and allows GC
            // The async function was already called above (type(props)), but by
            // not awaiting or tracking it, we let it run once in SSR and let GC handle it.
            // The client will execute it again via /rsc for the actual content.

            // Mark chunk as pending - client knows to get this from /rsc stream
            // This marker tells the client: "this chunk is async, wait for /rsc"
            context.chunks.push({
              type: "J",
              id,
              value: { __rsc_pending: true }, // Marker for pending async
            });
            return { processedElement: placeholder, chunkId: id };
          }

          // In await-all mode, wait for the async component
          ssrLogger.debug("Awaiting async server component...");
          const resolved = await result;
          // Validate resolved result
          if (resolved === undefined) {
            ssrLogger.warn(
              `Async server component ${componentName(
                type,
                "anonymous",
              )} returned undefined`,
            );
          }
          return await preprocessTree(resolved, context);
        }

        // Validate sync result
        if (result === undefined) {
          ssrLogger.warn(
            `Server component ${componentName(
              type,
              "anonymous",
            )} returned undefined`,
          );
        }

        // Recursively process the result
        return await preprocessTree(result, context);
      } catch (error) {
        ssrLogger
          .with({ error })
          .error(
            `render SSR: server component ${componentName(
              type,
              "anonymous",
            )} threw; sent an error chunk in its place`,
          );
        const errorId = context.nextId++;
        context.chunks.push({
          type: "E",
          id: errorId,
          value: errorChunk.toClientErrorValue(error),
        });
        return { processedElement: null, chunkId: errorId };
      }
    }

    // Built-in element (string type like "div", "span")
    if (typeof type === "string") {
      // Process children
      let processedChildren = props?.children;
      let childrenChunkId: number | undefined;

      if (props?.children !== undefined) {
        const childResult = await preprocessTree(props.children, context);
        processedChildren = childResult.processedElement;
        childrenChunkId = childResult.chunkId;
      }

      // Create the processed element for React SSR
      // Ensure array children have keys
      const safeChildren = Array.isArray(processedChildren)
        ? ensureArrayKeys(processedChildren)
        : processedChildren;
      // Preserve the original key if present
      const processedProps =
        originalKey !== null && originalKey !== undefined
          ? { ...props, key: originalKey, children: safeChildren }
          : { ...props, children: safeChildren };
      const processedElement = React.createElement(type, processedProps);

      // Create RSC chunk for this element
      const id = context.nextId++;
      const chunkProps: Record<string, TreeNode> = {};
      if (props !== undefined) {
        for (const [key, value] of Object.entries(props)) {
          if (typeof value === "function") continue;
          if (key === "children" && childrenChunkId !== undefined) {
            chunkProps[key] = `$${childrenChunkId}`;
          } else {
            chunkProps[key] = protocol.encodeJsonValue(value);
          }
        }
      }

      context.chunks.push({
        type: "J",
        id,
        value: {
          $$typeof: "react.element",
          type,
          props: chunkProps,
        },
      });

      return { processedElement, chunkId: id };
    }

    // Suspense boundary - render children for SSR HTML and RSC payload
    if (type === React.Suspense) {
      ssrLogger.debug("Processing Suspense boundary");

      // Save previous fallback for nested Suspense support
      const previousFallback = context.suspenseFallback;

      // Pre-process fallback ONCE here (before processing children)
      // This way async components can use it directly without await
      let processedFallback = null;
      if (props?.fallback !== undefined) {
        const fallbackResult = await preprocessTree(props.fallback, context);
        processedFallback = fallbackResult.processedElement;
      }

      // Store PROCESSED fallback in context for async component placeholders
      context.suspenseFallback = processedFallback;

      // Process children (async components) for both SSR HTML and RSC payload
      let processedChildren = null;
      let childrenChunkId: number | undefined;

      if (props?.children !== undefined) {
        ssrLogger.debug("Processing Suspense children...");
        const childResult = await preprocessTree(props.children, context);
        processedChildren = childResult.processedElement;
        childrenChunkId = childResult.chunkId;
        ssrLogger.debug("Suspense children processed");
      }

      // Restore previous fallback after processing children
      context.suspenseFallback = previousFallback;

      // For SSR HTML, render the actual content (children if available, else fallback)
      const content = processedChildren ?? processedFallback;
      // Ensure array children have keys
      const safeContent = Array.isArray(content)
        ? ensureArrayKeys(content)
        : content;
      const processedElement = React.createElement(
        React.Fragment,
        null,
        safeContent,
      );

      const id = context.nextId++;
      // Store reference to children chunk in RSC payload
      context.chunks.push({
        type: "J",
        id,
        value: childrenChunkId !== undefined ? `$${childrenChunkId}` : null,
      });

      return { processedElement, chunkId: id };
    }

    // React built-in types (Fragment, etc.)
    if (typeof type === "symbol" || type === React.Fragment) {
      // Process children
      let processedChildren = props?.children;
      let childrenChunkId: number | undefined;

      if (props?.children !== undefined) {
        const childResult = await preprocessTree(props.children, context);
        processedChildren = childResult.processedElement;
        childrenChunkId = childResult.chunkId;
      }

      // Ensure array children have keys
      const safeChildren = Array.isArray(processedChildren)
        ? ensureArrayKeys(processedChildren)
        : processedChildren;
      // Preserve the original key if present
      const fragmentProps =
        originalKey !== null && originalKey !== undefined
          ? { ...props, key: originalKey, children: safeChildren }
          : { ...props, children: safeChildren };
      const processedElement = React.createElement(type, fragmentProps);

      const id = context.nextId++;
      // Store reference to children chunk, not the actual elements
      context.chunks.push({
        type: "J",
        id,
        value: childrenChunkId !== undefined ? `$${childrenChunkId}` : null,
      });

      return { processedElement, chunkId: id };
    }

    // Unhandled React element type - log warning and return null
    ssrLogger.warn(`Unhandled React element type: ${typeof type}`, {
      typeSymbol: type?.$$typeof?.toString?.(),
      typeName: type?.name,
      typeValue: type,
    });

    const id = context.nextId++;
    context.chunks.push({ type: "J", id, value: null });
    return { processedElement: null, chunkId: id };
  }

  // Plain objects (props, etc.)
  if (typeof element === "object" && element !== null) {
    const id = context.nextId++;
    const processedObj: Record<string, TreeNode> = {};

    for (const [key, value] of Object.entries(element)) {
      if (typeof value === "function") continue;
      if (typeof value === "object" && value !== null) {
        // Entries are processed in order: preprocessTree takes chunk ids from
        // the shared context counter, so the order fixes the ids.
        // deno-lint-ignore no-await-in-loop
        const valueResult = await preprocessTree(value, context);
        processedObj[key] = valueResult.processedElement;
      } else {
        processedObj[key] = value;
      }
    }

    // The chunk gets an escaped copy; the HTML render keeps the values.
    context.chunks.push({
      type: "J",
      id,
      value: protocol.encodeJsonValue(processedObj),
    });
    return { processedElement: processedObj, chunkId: id };
  }

  // Fallback
  const id = context.nextId++;
  context.chunks.push({ type: "J", id, value: element });
  return { processedElement: element, chunkId: id };
}

/**
 * Render a React element tree to HTML with RSC payload
 *
 * @param element - The root React element to render
 * @param bundlerConfig - Module map for client component resolution
 * @param options - SSR rendering options
 * @returns SSR result with HTML, RSC payload, and client modules
 */
export async function renderSSR(
  // Any value a server component tree can hold; the walk narrows it per node.
  // deno-lint-ignore no-explicit-any
  element: any,
  bundlerConfig: BundlerConfig,
  options: SSROptions = { streamMode: "await-all" },
): Promise<SSRResult> {
  ssrLogger.debug("Starting SSR render...");

  // Debug: inspect incoming element
  ssrLogger.debug(`Input element type: ${typeof element}`);
  if (element !== null && typeof element === "object") {
    ssrLogger.debug(`Element $$typeof: ${element.$$typeof?.toString?.()}`);
    ssrLogger.debug(`Element type: ${describeType(element.type)}`);
  }

  // Create SSR context
  // Start nextId at 1 to reserve ID 0 for the root reference
  const context: SSRContext = {
    bundlerConfig,
    nextId: 1,
    chunks: [],
    clientModules: new Set(),
    pendingPromises: [],
    streamMode: options.streamMode,
    asyncComponents: new Map(),
    suspenseFallback: null,
  };

  try {
    // Pre-process the tree to handle client components and collect RSC chunks
    const { processedElement, chunkId: rootChunkId } = await preprocessTree(
      element,
      context,
    );

    // Add root chunk marker (chunk 0 is always the root reference)
    // Since we reserved ID 0 (nextId starts at 1), we can safely add it
    context.chunks.unshift({
      type: "J",
      id: 0,
      value: `$${rootChunkId}`,
    });

    ssrLogger.debug(
      `Pre-processed tree, collected ${context.chunks.length} RSC chunks`,
    );

    // React reports every render error through onError: an error in the
    // shell, which also rejects renderToReadableStream and is handled in the
    // catch below, and errors inside Suspense boundaries, which React leaves
    // for the client to render again. The latter are logged once the HTML is
    // read, so each error is logged once.
    const boundaryErrors: unknown[] = [];

    // Render to HTML using React's renderToReadableStream
    const stream = await ReactDOMServer.renderToReadableStream(
      processedElement,
      {
        onError: (error: unknown) => {
          boundaryErrors.push(error);
        },
      },
    );

    // Wait for all content if in await-all mode
    if (options.streamMode === "await-all") {
      await stream.allReady;
    }

    // Read the whole stream as UTF-8 text
    const html = await new Response(stream).text();

    await Promise.all(
      boundaryErrors.map((error) =>
        ssrLogger
          .with({ error })
          .error(
            "render page to HTML: a Suspense boundary failed; the client renders it again",
          ),
      ),
    );

    ssrLogger.debug(`SSR complete, HTML length: ${html.length}`);

    return {
      html,
      rscPayload: context.chunks,
      clientModules: Array.from(context.clientModules),
    };
  } catch (error) {
    // Handled here: the error is logged once, under the id the visitor sees,
    // and the response carries only that id and a fixed message.
    const correlationId = crypto.randomUUID();
    await ssrLogger
      .with({ correlationId, error })
      .error(
        "render page to HTML: rendering failed; sent the error fallback with this correlationId",
      );

    return createSSRErrorFallback(correlationId);
  }
}

/**
 * What a visitor sees when the page cannot be rendered at all. The error
 * stays in the server log, under the correlation id shown next to this text.
 */
export const SSR_ERROR_MESSAGE =
  "This page could not be rendered. Reload it, or report this error id:";

/**
 * Build the result renderSSR returns when rendering fails as a whole. It
 * carries a fixed message and the correlation id, never the error's own
 * message: that text can hold request data and internal detail, and
 * runtime/server.ts writes this HTML into the page as it is.
 *
 * @param correlationId - Id of the server log entry that holds the error; a
 *   crypto.randomUUID() value, so it needs no HTML escaping
 */
function createSSRErrorFallback(correlationId: string): SSRResult {
  const message = `${SSR_ERROR_MESSAGE} ${correlationId}`;

  return {
    html: `<div data-ssr-error="true" data-error-id="${correlationId}" role="alert">${message}</div>`,
    rscPayload: [{ type: "E", id: 0, value: { message } }],
    clientModules: [],
  };
}

/**
 * Serialize RSC payload for embedding in HTML
 *
 * @param chunks - RSC chunks to serialize
 * @returns JSON string safe for embedding in script tag
 */
export function serializeRSCPayload(chunks: RSCChunk[]): string {
  return JSON.stringify(chunks);
}

/**
 * Generate RSC payload script tag
 *
 * @param chunks - RSC chunks to embed
 * @returns HTML script tag with serialized payload
 */
export function generateRSCPayloadScript(chunks: RSCChunk[]): string {
  const serialized = serializeRSCPayload(chunks);
  // Escape for script context so no value can end the element
  const escaped = scriptJson.escapeJsonForScript(serialized);
  return `<script id="__RSC_PAYLOAD__" type="application/json">${escaped}</script>`;
}
