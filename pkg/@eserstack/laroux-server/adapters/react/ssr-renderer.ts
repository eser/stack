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

import { cloneElement, createElement, Fragment, Suspense } from "react";
// @ts-ignore - react-dom/server types
import { renderToReadableStream } from "react-dom/server";
import {
  isClientReference,
  isReactElement,
  type RSCChunk,
} from "@eserstack/laroux-react/protocol";
import type { BundlerConfig } from "./rsc-flight-renderer.ts";
import * as logging from "@eserstack/logging";

const ssrLogger = logging.logger.getLogger(["laroux-server", "react", "ssr"]);

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
// deno-lint-ignore no-explicit-any
function ensureArrayKeys(arr: any[]): any[] {
  // Fast-path: check if any valid React element lacks a key
  let needsProcessing = false;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    // Use isReactElement from protocol.ts for element type check
    if (isReactElement(item)) {
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
    if (isReactElement(item)) {
      // Only clone if key is missing
      if (item.key === null || item.key === undefined || item.key === "") {
        result[i] = cloneElement(item, { key: `.${i}` });
        continue;
      }
    }
    result[i] = item;
  }
  return result;
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
  // deno-lint-ignore no-explicit-any
  asyncComponents: Map<number, { promise: Promise<any>; fallback: any }>;
  /** Current Suspense fallback for async component placeholders */
  // deno-lint-ignore no-explicit-any
  suspenseFallback: any;
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
  // deno-lint-ignore no-explicit-any
  children: any,
  elementChunkId: number,
  // deno-lint-ignore no-explicit-any
): any {
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
  return createElement(
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
  // deno-lint-ignore no-explicit-any
  element: any,
  context: SSRContext,
  // deno-lint-ignore no-explicit-any
): Promise<{ processedElement: any; chunkId: number }> {
  // Null/undefined
  if (element === null || element === undefined) {
    const id = context.nextId++;
    context.chunks.push({ type: "J", id, value: null });
    return { processedElement: null, chunkId: id };
  }

  // Primitives (string, number, boolean)
  if (typeof element !== "object") {
    const id = context.nextId++;
    context.chunks.push({ type: "J", id, value: element });
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
  if (isClientReference(element)) {
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
  if (isReactElement(element)) {
    // Extract key from element - React stores it on the element object, not in props
    const { type, props, key: originalKey } = element;

    // Debug: log what type we're processing
    ssrLogger.debug(
      `Processing React element with type: ${typeof type}, name: ${
        type?.name || type?.toString?.() || "unknown"
      }`,
    );

    // Client component element (type is a client reference)
    if (isClientReference(type)) {
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
      // deno-lint-ignore no-explicit-any
      const serializedProps: Record<string, any> = {};
      if (props !== undefined) {
        for (const [key, value] of Object.entries(props)) {
          if (typeof value === "function") continue;
          if (key === "children" && childrenChunkId !== undefined) {
            // Reference the processed children chunk
            serializedProps[key] = `$${childrenChunkId}`;
          } else if (typeof value === "object" && value !== null) {
            const valueResult = await preprocessTree(value, context);
            serializedProps[key] = `$${valueResult.chunkId}`;
          } else {
            serializedProps[key] = value;
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
          "$$typeof": "react.element",
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
        ssrLogger.error("Error rendering ForwardRef component:", error);
        const errorId = context.nextId++;
        context.chunks.push({
          type: "E",
          id: errorId,
          value: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
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
          `Executing server component: ${type.name || "anonymous"}`,
        );
        // Execute the server component
        const result = type(props);

        // Handle async components
        if (result instanceof Promise) {
          // In streaming mode, don't await AND don't track the promise
          // This prevents duplicate execution - async components only run via /rsc
          if (context.streamMode === "streaming-classic") {
            ssrLogger.debug(
              `Async server component ${
                type.name || "anonymous"
              } skipped in SSR (streaming-classic mode) - client will fetch via /rsc`,
            );
            const id = context.nextId++;

            // Return a placeholder that will be hydrated by /rsc endpoint
            // Use the pre-processed Suspense fallback directly (no await needed)
            const fallbackContent = context.suspenseFallback ?? "Loading...";
            // Ensure array children have keys
            const safeFallback = Array.isArray(fallbackContent)
              ? ensureArrayKeys(fallbackContent)
              : fallbackContent;
            const placeholder = createElement("div", {
              "data-async-boundary": id,
              "data-component": type.name || "async",
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
              `Async server component ${
                type.name || "anonymous"
              } returned undefined`,
            );
          }
          return await preprocessTree(resolved, context);
        }

        // Validate sync result
        if (result === undefined) {
          ssrLogger.warn(
            `Server component ${type.name || "anonymous"} returned undefined`,
          );
        }

        // Recursively process the result
        return await preprocessTree(result, context);
      } catch (error) {
        ssrLogger.error("Error rendering server component:", error);
        const errorId = context.nextId++;
        context.chunks.push({
          type: "E",
          id: errorId,
          value: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
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
      const processedProps = originalKey !== null && originalKey !== undefined
        ? { ...props, key: originalKey, children: safeChildren }
        : { ...props, children: safeChildren };
      const processedElement = createElement(type, processedProps);

      // Create RSC chunk for this element
      const id = context.nextId++;
      // deno-lint-ignore no-explicit-any
      const chunkProps: Record<string, any> = {};
      if (props !== undefined) {
        for (const [key, value] of Object.entries(props)) {
          if (typeof value === "function") continue;
          if (key === "children" && childrenChunkId !== undefined) {
            chunkProps[key] = `$${childrenChunkId}`;
          } else {
            chunkProps[key] = value;
          }
        }
      }

      context.chunks.push({
        type: "J",
        id,
        value: {
          "$$typeof": "react.element",
          type,
          props: chunkProps,
        },
      });

      return { processedElement, chunkId: id };
    }

    // Suspense boundary - render children for SSR HTML and RSC payload
    if (type === Suspense) {
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
      const processedElement = createElement(
        Fragment,
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
    if (typeof type === "symbol" || type === Fragment) {
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
      const fragmentProps = originalKey !== null && originalKey !== undefined
        ? { ...props, key: originalKey, children: safeChildren }
        : { ...props, children: safeChildren };
      const processedElement = createElement(type, fragmentProps);

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
    // deno-lint-ignore no-explicit-any
    const processedObj: Record<string, any> = {};

    for (const [key, value] of Object.entries(element)) {
      if (typeof value === "function") continue;
      if (typeof value === "object" && value !== null) {
        const valueResult = await preprocessTree(value, context);
        processedObj[key] = valueResult.processedElement;
      } else {
        processedObj[key] = value;
      }
    }

    context.chunks.push({ type: "J", id, value: processedObj });
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
  // deno-lint-ignore no-explicit-any
  element: any,
  bundlerConfig: BundlerConfig,
  options: SSROptions = { streamMode: "await-all" },
): Promise<SSRResult> {
  ssrLogger.debug("Starting SSR render...");

  // Debug: inspect incoming element
  ssrLogger.debug(`Input element type: ${typeof element}`);
  if (element && typeof element === "object") {
    ssrLogger.debug(`Element $$typeof: ${element.$$typeof?.toString?.()}`);
    ssrLogger.debug(
      `Element type: ${element.type?.name || element.type || "unknown"}`,
    );
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

    // Render to HTML using React's renderToReadableStream
    const stream = await renderToReadableStream(processedElement, {
      onError: (error: Error) => {
        ssrLogger.error("SSR render error:", error);
      },
    });

    // Wait for all content if in await-all mode
    if (options.streamMode === "await-all") {
      await stream.allReady;
    }

    // Read the stream to get HTML string
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode(); // Flush remaining

    ssrLogger.debug(`SSR complete, HTML length: ${html.length}`);

    return {
      html,
      rscPayload: context.chunks,
      clientModules: Array.from(context.clientModules),
    };
  } catch (error) {
    ssrLogger.error("SSR rendering failed:", error);

    // Return error fallback
    return {
      html: `<div data-ssr-error="true">SSR Error: ${
        error instanceof Error ? error.message : String(error)
      }</div>`,
      rscPayload: [
        {
          type: "E",
          id: 0,
          value: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      ],
      clientModules: [],
    };
  }
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
  // Escape </script> to prevent XSS
  const escaped = serialized.replace(/<\/script/gi, "<\\/script");
  return `<script id="__RSC_PAYLOAD__" type="application/json">${escaped}</script>`;
}
