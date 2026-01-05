// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * React Flight Client - RSC Parser for Deno/Browser
 *
 * This module implements the client-side RSC wire protocol parser.
 * It reconstructs React elements from the streaming RSC payload sent by the server.
 *
 * Key design decisions:
 * - Synchronous processing: Waits for all chunks before initializing root
 * - Two-phase approach: Parse chunks first, then resolve references
 * - Forward references: Chunks may reference other chunks that arrive later
 *
 * @see https://github.com/facebook/react/tree/main/packages/react-server-dom-webpack
 */

// deno-lint-ignore-file no-explicit-any
// Note: This RSC protocol parser uses 'any' extensively for:
// - Dynamic JSON payloads from wire protocol
// - React elements with polymorphic types
// - Promise/thenable chunk handlers
// - State machine chunk transitions

import { Children, createElement, Fragment } from "react";
import {
  isReactElement,
  type ModuleReference,
  parseChunk,
  type RSCChunk,
} from "./protocol.ts";

// Build-time define - bundler replaces process.env.DEBUG with "false" at build time
// All if(DEBUG) blocks are tree-shaken in production builds
const DEBUG = (globalThis as any).process?.env?.DEBUG === "true";

/**
 * Apply keys to children array using React.Children.toArray()
 * This is React's standard way of handling child arrays and adds stable keys
 * Used to avoid "Each child in a list should have a unique key" warnings
 */
function applyChildKeys(children: any[]): any[] {
  return Children.toArray(children);
}

// Chunk states matching official React Flight implementation
const PENDING = 0; // Chunk not yet received from server
const BLOCKED = 1; // Chunk being initialized (prevents cycles)
const RESOLVED_MODEL = 2; // JSON received but not parsed
const RESOLVED_MODULE = 3; // Module reference received but not loaded
const INITIALIZED = 4; // Fully initialized and ready
const ERRORED = 5; // Failed to initialize

/**
 * Listener for chunk resolution
 * When a PENDING chunk resolves, all listeners are notified
 */
interface ChunkListener {
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

/**
 * PENDING: Chunk not yet received from server (forward reference)
 * Creates a thenable that React can suspend on
 */
interface PendingChunk {
  _status: typeof PENDING;
  status: "pending"; // For React's thenable protocol
  value: null;
  reason: null;
  _response: ClientContext;
  _listeners: ChunkListener[];
  then(resolve: (value: any) => void, reject?: (error: any) => void): void;
}

/**
 * BLOCKED: Chunk currently being initialized
 * Used to detect and handle circular references
 */
interface BlockedChunk {
  _status: typeof BLOCKED;
  value: null;
  reason: null;
  _response: ClientContext;
  _listeners: ChunkListener[];
}

/**
 * RESOLVED_MODEL: Raw JSON received but not yet parsed
 * Parsing is deferred until readChunk() is called during React's render
 */
interface ResolvedModelChunk {
  _status: typeof RESOLVED_MODEL;
  value: any; // Raw JSON, not parsed
  reason: null;
  _response: ClientContext;
}

/**
 * RESOLVED_MODULE: Module reference received but not yet loaded
 * Loading is deferred until readChunk() is called during React's render
 */
interface ResolvedModuleChunk {
  _status: typeof RESOLVED_MODULE;
  value: ModuleReference;
  reason: null;
  _response: ClientContext;
}

/**
 * INITIALIZED: Fully initialized and ready to use
 * Value has been parsed and all references resolved
 */
interface InitializedChunk {
  _status: typeof INITIALIZED;
  value: any; // Fully initialized value
  reason: null;
  _response: ClientContext;
}

/**
 * ERRORED: Failed to initialize
 * Contains the error that caused the failure
 */
interface ErroredChunk {
  _status: typeof ERRORED;
  value: null;
  reason: any;
  _response: ClientContext;
}

type Chunk =
  | PendingChunk
  | BlockedChunk
  | ResolvedModelChunk
  | ResolvedModuleChunk
  | InitializedChunk
  | ErroredChunk;

interface ClientContext {
  chunks: Map<number, Chunk>;
  moduleCache: Map<string, any>;
  moduleLoader: ModuleLoader;
  _closed: boolean; // Has the stream been closed?
  _closedReason: Error | null; // Error that caused stream to close (if any)
}

/**
 * Module loader function type
 */
export type ModuleLoader = (id: string, name: string) => Promise<any> | any;

/**
 * ChunkReader - Deferred chunk reader for progressive Suspense
 *
 * This component reads a chunk during React's render phase.
 * If the chunk is PENDING, readChunk() will throw it for Suspense to catch.
 * When the chunk resolves, React will retry rendering and ChunkReader will succeed.
 *
 * This is CRITICAL for progressive Suspense rendering - it defers chunk reading
 * from parse time to render time, allowing React to see Suspense boundaries
 * BEFORE encountering PENDING children.
 */
function ChunkReader({ chunk }: { chunk: Chunk }): any {
  if (DEBUG) {
    console.log(
      `[CLIENT] 🔍 ChunkReader rendering (chunk status: ${chunk._status})`,
    );
  }
  // Use readChunk which handles initialization and throwing for Suspense
  return readChunk(chunk);
}

/**
 * Default module loader using dynamic import
 */
const defaultModuleLoader: ModuleLoader = async (id: string, name: string) => {
  try {
    const module = await import(id);
    if (name === "default") {
      return module.default;
    } else if (name === "*") {
      return module;
    } else {
      return module[name];
    }
  } catch (error) {
    console.error(`Failed to load client module: ${id}`, error);
    throw error;
  }
};

/**
 * Load a client module using the provided loader
 */
async function loadClientModule(
  moduleRef: ModuleReference,
  moduleLoader: ModuleLoader,
): Promise<any> {
  const { id, name } = moduleRef;
  return await moduleLoader(id, name);
}

/**
 * Create a new pending chunk (forward reference)
 * Returns a Thenable with a listener queue that React can suspend on
 */
function createPendingChunk(context: ClientContext): PendingChunk {
  const listeners: ChunkListener[] = [];

  const thenable: PendingChunk = {
    _status: PENDING,
    status: "pending",
    value: null,
    reason: null,
    _response: context,
    _listeners: listeners,
    then(onResolve: (value: any) => void, onReject?: (error: any) => void) {
      // Create a promise that gets resolved when chunk arrives
      const promise = new Promise<any>((resolve, reject) => {
        listeners.push({ resolve, reject });
      });
      return promise.then(onResolve, onReject);
    },
  };

  if (DEBUG) {
    console.log(
      `[CLIENT] 🏗️  Created PENDING chunk with status=${thenable._status} (typeof: ${typeof thenable
        ._status})`,
    );
  }

  return thenable;
}

/**
 * Read a chunk's value, throwing if not ready (called by React during render)
 * This is the core of lazy evaluation - it's called by React's lazy initializer
 *
 * State machine:
 * - RESOLVED_MODEL/RESOLVED_MODULE: Initialize now (parse JSON or load module)
 * - INITIALIZED: Return value
 * - PENDING/BLOCKED: Throw thenable for React Suspense
 * - ERRORED: Throw error
 *
 * @param chunk The chunk to read
 * @returns The initialized value
 * @throws {Chunk} If chunk is PENDING/BLOCKED (for React Suspense)
 * @throws {Error} If chunk is ERRORED
 */
function readChunk(chunk: Chunk): any {
  // Lazy initialization - only parse/load if needed
  switch (chunk._status) {
    case RESOLVED_MODEL:
      if (DEBUG) {
        console.log(
          `[CLIENT] 🔄 Lazy-initializing RESOLVED_MODEL chunk during render`,
        );
      }
      initializeModelChunk(chunk as ResolvedModelChunk);
      break;
    case RESOLVED_MODULE:
      if (DEBUG) {
        console.log(
          `[CLIENT] 🔄 Lazy-initializing RESOLVED_MODULE chunk during render`,
        );
      }
      initializeModuleChunk(chunk as ResolvedModuleChunk);
      break;
  }

  // Return or throw based on status
  switch (chunk._status) {
    case INITIALIZED:
      return chunk.value;

    case PENDING:
    case BLOCKED:
      // Throw thenable for React Suspense - this is the magic!
      // React will catch this throw and suspend until chunk resolves
      if (DEBUG) {
        console.log(
          `[CLIENT] 🔴 Throwing ${
            chunk._status === PENDING ? "PENDING" : "BLOCKED"
          } chunk for Suspense`,
        );
      }
      throw chunk;

    case ERRORED:
      throw chunk.reason;

    default:
      // Type assertion needed: TypeScript exhaustiveness check for unreachable code path
      throw new Error(`Unknown chunk status: ${(chunk as any)._status}`);
  }
}

/**
 * Get a chunk by ID, creating a pending chunk if it doesn't exist
 * This is called when parsing encounters a $ reference
 *
 * If the stream is closed, creates an ERRORED chunk instead
 */
function getChunk(id: number, context: ClientContext): Chunk {
  const chunk = context.chunks.get(id);
  if (chunk) {
    return chunk;
  }

  // Stream closed? Create error chunk
  if (context._closed) {
    const error = context._closedReason ??
      new Error("Stream closed before chunk arrived");
    const erroredChunk: ErroredChunk = {
      _status: ERRORED,
      value: null,
      reason: error,
      _response: context,
    };
    context.chunks.set(id, erroredChunk);
    return erroredChunk;
  }

  // Create pending chunk for forward reference
  const pending = createPendingChunk(context);
  context.chunks.set(id, pending);
  return pending;
}

/**
 * Initialize a RESOLVED_MODEL chunk to INITIALIZED
 * This is called by readChunk during React's render phase
 *
 * State transitions: RESOLVED_MODEL → BLOCKED → INITIALIZED (or ERRORED)
 * BLOCKED state prevents infinite loops with circular references
 *
 * @param chunk The RESOLVED_MODEL chunk to initialize
 */
function initializeModelChunk(chunk: ResolvedModelChunk): void {
  const context = chunk._response;
  const model = chunk.value;

  // Find chunk ID for logging
  let chunkId = -1;
  for (const [id, c] of context.chunks.entries()) {
    if (c === chunk) {
      chunkId = id;
      break;
    }
  }

  // Transition to BLOCKED to handle cycles
  // Double assertion needed: chunk state machine transitions between discriminated union types
  const blockedChunk = chunk as any as BlockedChunk;
  blockedChunk._status = BLOCKED;
  blockedChunk._listeners = [];

  try {
    // Parse model - may throw if references are PENDING
    const value = parseModel(model, context);

    // Successfully initialized
    // Double assertion needed: chunk state transition from BLOCKED to INITIALIZED
    const initializedChunk = chunk as any as InitializedChunk;
    initializedChunk._status = INITIALIZED;
    initializedChunk.value = value;

    // TRACE: Log what we stored for element chunks
    if (DEBUG && chunkId >= 0 && chunkId <= 25) {
      const hasSymbol = typeof value?.$$typeof === "symbol";
      console.log(`[CLIENT] ✅ Chunk ${chunkId} INITIALIZED:`, {
        rawModelType: model?.type,
        rawModel$$typeof: model?.$$typeof,
        parsedHasSymbol: hasSymbol,
        parsedType: hasSymbol ? "ReactElement" : (value?.type ?? typeof value),
        parsedKeys: value && typeof value === "object"
          ? Object.keys(value).slice(0, 5)
          : null,
      });
    }

    // Wake any blocked listeners
    wakeChunkListeners(blockedChunk, value);

    if (DEBUG) {
      console.log(`[CLIENT] ✅ Model chunk initialized successfully`);
    }
  } catch (error) {
    // Check if this is a Suspense throw (PENDING/BLOCKED chunk)
    // If so, re-throw it - don't treat it as an error!
    // Type assertion needed: checking if thrown error is a pending chunk (Suspense throw pattern)
    if (
      typeof error === "object" && error !== null && "status" in error &&
      ((error as any)._status === PENDING || (error as any)._status === BLOCKED)
    ) {
      if (DEBUG) {
        console.log(
          `[CLIENT] ⏸️  Chunk initialization suspended - re-throwing for Suspense`,
        );
      }
      // Reset chunk back to RESOLVED_MODEL so it can be retried
      // Double assertion needed: chunk state reset for Suspense retry
      const resolvedChunk = chunk as any as ResolvedModelChunk;
      resolvedChunk._status = RESOLVED_MODEL;
      resolvedChunk.value = model;
      // Re-throw for React Suspense
      throw error;
    }

    // Real error (parse failure, etc.)
    // Double assertion needed: chunk state transition to ERRORED
    const erroredChunk = chunk as any as ErroredChunk;
    erroredChunk._status = ERRORED;
    erroredChunk.reason = error as Error;

    // Reject blocked listeners
    rejectChunkListeners(blockedChunk, error as Error);

    if (DEBUG) {
      console.error(`[CLIENT] ❌ Model chunk initialization failed:`, error);
    }
  }
}

/**
 * Initialize a RESOLVED_MODULE chunk to INITIALIZED
 * This is called by readChunk during React's render phase
 *
 * Note: Module loading is synchronous here - modules should be pre-loaded
 * or loaded via dynamic import at processChunk time
 *
 * @param chunk The RESOLVED_MODULE chunk to initialize
 */
function initializeModuleChunk(chunk: ResolvedModuleChunk): void {
  // Module chunks are already initialized at processChunk time
  // This function is here for completeness and future async module loading
  // Double assertion needed: chunk state transition from RESOLVED_MODULE to INITIALIZED
  const initializedChunk = chunk as any as InitializedChunk;
  initializedChunk._status = INITIALIZED;
  // value stays the same - it's the loaded module
}

/**
 * Wake all listeners when a chunk resolves
 * Called when a PENDING or BLOCKED chunk transitions to INITIALIZED
 *
 * @param chunk The chunk that resolved
 * @param value The resolved value
 */
function wakeChunkListeners(
  chunk: PendingChunk | BlockedChunk,
  value: any,
): void {
  const listeners = chunk._listeners;
  if (listeners && listeners.length > 0) {
    if (DEBUG) {
      console.log(`[CLIENT] 🔔 Waking ${listeners.length} listeners`);
    }
    // Notify in microtask to let React properly handle updates
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener.resolve(value);
      }
    });
  }
}

/**
 * Reject all listeners when a chunk errors
 * Called when a PENDING or BLOCKED chunk transitions to ERRORED
 *
 * @param chunk The chunk that errored
 * @param error The error that occurred
 */
function rejectChunkListeners(
  chunk: PendingChunk | BlockedChunk,
  error: Error,
): void {
  const listeners = chunk._listeners;
  if (listeners && listeners.length > 0) {
    if (DEBUG) {
      console.log(`[CLIENT] 🔔 Rejecting ${listeners.length} listeners`);
    }
    queueMicrotask(() => {
      for (const listener of listeners) {
        listener.reject(error);
      }
    });
  }
}

/**
 * Parse a model value - standard approach with direct chunk reading
 *
 * @param model The model to parse
 * @param context The client context
 * @returns Parsed model
 */
function parseModel(model: any, context: ClientContext): any {
  // Handle $ references
  if (typeof model === "string" && model.startsWith("$")) {
    return parseReference(model, context);
  }

  // Primitives pass through
  if (model === null || model === undefined || typeof model !== "object") {
    return model;
  }

  // Arrays - map elements
  if (Array.isArray(model)) {
    return model.map((item) => parseModel(item, context));
  }

  // Real React elements (already parsed, with Symbol $$typeof) - pass through as-is
  // This prevents losing the Symbol $$typeof when copying object properties
  if (isReactElement(model)) {
    return model;
  }

  // Serialized React elements (from RSC payload, with string $$typeof) - convert to real element
  // Handle both "react.element" and "react.transitional.element" (React 19)
  const typeofValue = model.$$typeof ?? model.$typeof;

  // Debug: Log EVERY object that has type+props to ensure we catch all elements
  if (DEBUG && model.type !== undefined && model.props !== undefined) {
    console.log(
      `[CLIENT] 🔍 parseModel object with type+props:`,
      {
        modelType: model.type,
        "$$typeof_value": model.$$typeof,
        "$typeof_value": model.$typeof,
        typeofValue,
        willParseAsElement: typeofValue === "react.element" ||
          typeofValue === "react.transitional.element",
        allKeys: Object.keys(model),
      },
    );
  }

  if (
    typeofValue === "react.element" ||
    typeofValue === "react.transitional.element"
  ) {
    if (DEBUG) {
      console.log(
        `[CLIENT] 🔧 parseModel found serialized React element:`,
        { type: model.type, hasProps: !!model.props },
      );
    }
    const result = parseReactElement(model, context);
    // Verify the result has Symbol $$typeof
    if (DEBUG && result && typeof result === "object") {
      console.log(`[CLIENT] ✅ parseReactElement returned:`, {
        type: model.type,
        resultHasSymbolTypeof: typeof result.$$typeof === "symbol",
        resultTypeof: result.$$typeof,
        resultType: result.type,
      });
    }
    return result;
  }

  // Plain objects - parse properties
  if (Object.getPrototypeOf(model) === Object.prototype) {
    const parsed: any = {};
    for (const [key, val] of Object.entries(model)) {
      parsed[key] = parseModel(val, context);
    }
    return parsed;
  }

  return model;
}

/**
 * Parse a $ reference - read chunk value
 *
 * @param ref The $ reference string (e.g., "$79")
 * @param context The client context
 * @returns The chunk value
 */
function parseReference(ref: string, context: ClientContext): any {
  // Handle module references ($M123) vs regular references ($123)
  let id: number;

  if (ref.startsWith("$M")) {
    // Module reference: $M123
    id = parseInt(ref.slice(2), 10);
  } else if (ref.startsWith("$")) {
    // Regular reference: $123
    id = parseInt(ref.slice(1), 10);
  } else {
    // Not a reference, return as-is
    return ref;
  }

  if (isNaN(id)) {
    // Not a valid reference, return as-is
    return ref;
  }

  // Get or create chunk (might be PENDING if forward reference)
  const chunk = getChunk(id, context);

  if (DEBUG) {
    console.log(
      `[CLIENT] 🔗 Reading reference ${ref} to chunk ${id} (status: ${chunk._status})`,
    );
  }

  // Read chunk - will throw if PENDING
  const result = readChunk(chunk);

  // TRACE: Log what we got back for element chunks
  if (DEBUG && id <= 30) {
    console.log(`[CLIENT] 🔗 parseReference ${ref} returned:`, {
      id,
      resultType: typeof result,
      isArray: Array.isArray(result),
      hasSymbolTypeof: typeof result?.$$typeof === "symbol",
      typeofValue: result?.$$typeof,
      resultKeys: result && typeof result === "object"
        ? Object.keys(result).slice(0, 6)
        : null,
    });
  }

  return result;
}

/**
 * Parse a React element - CRITICAL for progressive Suspense!
 *
 * Special handling for Suspense elements:
 * - DON'T eagerly parse children if they're PENDING chunk references
 * - Wrap PENDING children in ChunkReader to defer resolution until React's render phase
 * - This allows React to see the Suspense boundary BEFORE hitting PENDING children
 *
 * @param element The serialized React element
 * @param context The client context
 * @returns A React element
 */
function parseReactElement(element: any, context: ClientContext): any {
  // Resolve type
  let type = parseModel(element.type, context);

  if (DEBUG) {
    console.log(`[CLIENT] 🔧 parseReactElement:`, {
      rawType: element.type,
      resolvedType: typeof type === "symbol" ? type.toString() : type,
      hasProps: !!element.props,
      propsIsRef: typeof element.props === "string",
      propsKeys: element.props && typeof element.props === "object"
        ? Object.keys(element.props)
        : null,
    });
  }

  // Convert serialized symbols back to actual Symbol objects
  if (typeof type === "string" && type.startsWith("Symbol(")) {
    const symbolName = type.match(/Symbol\((.*)\)/)?.[1];
    if (symbolName) {
      type = Symbol.for(symbolName);
    }
  }

  // CRITICAL: Special handling for Suspense elements
  const isSuspense = type === Symbol.for("react.suspense");

  if (isSuspense) {
    // For Suspense, we need to handle children specially to enable progressive rendering
    // Check if children reference is PENDING BEFORE parsing (to avoid throw)

    // Get raw props value
    let rawProps = element.props;

    // If props is a reference, resolve it to get the raw object
    if (typeof rawProps === "string" && rawProps.startsWith("$")) {
      const propsId = parseInt(rawProps.slice(1), 10);
      if (!isNaN(propsId)) {
        const propsChunk = getChunk(propsId, context);
        // For RESOLVED_MODEL, get the raw JSON value
        if (
          propsChunk._status === RESOLVED_MODEL ||
          propsChunk._status === INITIALIZED
        ) {
          rawProps = propsChunk.value;
        }
      }
    }

    // Check if raw props has children that's a reference
    if (
      rawProps !== null && typeof rawProps === "object" &&
      typeof rawProps.children === "string" && rawProps.children.startsWith("$")
    ) {
      const childRef = rawProps.children;
      const childId = parseInt(childRef.slice(1), 10);

      if (!isNaN(childId)) {
        const childChunk = getChunk(childId, context);

        // Check if child is PENDING or indirect PENDING reference
        let shouldWrap = childChunk._status === PENDING;

        if (!shouldWrap && childChunk._status === RESOLVED_MODEL) {
          const childValue = childChunk.value;
          if (typeof childValue === "string" && childValue.startsWith("$")) {
            const indirectId = parseInt(childValue.slice(1), 10);
            if (!isNaN(indirectId)) {
              const indirectChunk = getChunk(indirectId, context);
              if (indirectChunk._status === PENDING) {
                shouldWrap = true;
                if (DEBUG) {
                  console.log(
                    `[CLIENT] 🔍 Found indirect reference: chunk ${childId} -> chunk ${indirectId} (PENDING)`,
                  );
                }
              }
            }
          }
        }

        if (shouldWrap) {
          if (DEBUG) {
            console.log(
              `[CLIENT] 🎯 Suspense with PENDING child (chunk ${childId}) - wrapping in ChunkReader`,
            );
          }

          // Build props manually: parse fallback separately
          const { children: _, fallback, ...otherRawProps } = rawProps;

          // Parse fallback - it could be a reference like "$252" or a plain object
          // Use parseModel to resolve references and reconstruct React elements
          const parsedFallback = fallback
            ? parseModel(fallback, context)
            : undefined;

          // Parse other props (excluding children and fallback)
          const parsedOtherProps = Object.keys(otherRawProps).length > 0
            ? parseModel(otherRawProps, context)
            : {};

          // Return Suspense with ChunkReader as children
          return createElement(type, {
            ...parsedOtherProps,
            fallback: parsedFallback,
            children: createElement(ChunkReader, { chunk: childChunk }),
          });
        }
      }
    }
  }

  // Normal element - parse props
  const props = parseModel(element.props, context);

  // Handle children arrays to avoid React key warnings
  // When children is an array, use Children.toArray() for stable keys
  if (
    props !== null && typeof props === "object" && Array.isArray(props.children)
  ) {
    const { children, ...restProps } = props;
    const keyedChildren = applyChildKeys(children);

    if (DEBUG) {
      console.log(
        `[CLIENT] 🔧 parseReactElement creating element with array children:`,
        {
          type: typeof type === "symbol" ? type.toString() : type,
          restPropsKeys: Object.keys(restProps),
          childrenCount: keyedChildren.length,
        },
      );
    }
    try {
      return createElement(type, restProps, ...keyedChildren);
    } catch (err) {
      console.error(`[CLIENT] ❌ createElement failed with array children:`, {
        type: typeof type === "symbol" ? type.toString() : type,
        restProps,
        children: keyedChildren,
        error: err,
      });
      throw err;
    }
  }

  if (DEBUG) {
    console.log(`[CLIENT] 🔧 parseReactElement creating element:`, {
      type: typeof type === "symbol" ? type.toString() : type,
      propsKeys: props ? Object.keys(props) : null,
      hasChildren: props?.children !== undefined,
      childrenType: props?.children !== undefined
        ? (
          props.children === null
            ? "null"
            : props.children === undefined
            ? "undefined"
            : typeof props.children === "string"
            ? "string"
            : typeof props.children === "number"
            ? "number"
            : props.children?.$$typeof
            ? "ReactElement"
            : typeof props.children === "object"
            ? `object:${Object.keys(props.children).join(",")}`
            : typeof props.children
        )
        : "none",
    });
  }

  try {
    return createElement(type, props);
  } catch (err) {
    console.error(`[CLIENT] ❌ createElement failed:`, {
      type: typeof type === "symbol" ? type.toString() : type,
      props,
      error: err,
    });
    throw err;
  }
}

/**
 * Process an RSC chunk and update the chunk map
 *
 * KEY CHANGE: Store chunks as RESOLVED_MODEL/RESOLVED_MODULE WITHOUT parsing
 * Parsing is deferred until readChunk() is called during React's render phase
 *
 * Handles three chunk types:
 * - J (JSON): Store as RESOLVED_MODEL (raw JSON, NOT parsed)
 * - M (Module): Load module and store as INITIALIZED
 * - E (Error): Store as ERRORED
 *
 * If a chunk was previously created as a forward reference (PENDING state),
 * this will transition it and notify any waiting listeners.
 */
async function processChunk(
  rscChunk: RSCChunk,
  context: ClientContext,
): Promise<void> {
  const { type, id, value } = rscChunk;

  if (DEBUG) {
    const preview = typeof value === "string" ? value.slice(0, 50) : value;
    console.log(`[CLIENT] 📦 Processing chunk: ${type}${id}`, preview);
  }

  // Get existing chunk (might be PENDING forward reference)
  const existingChunk = context.chunks.get(id);
  const _wasPending = existingChunk?._status === PENDING;

  switch (type) {
    case "J": {
      // JSON chunk - store as RESOLVED_MODEL WITHOUT parsing
      if (DEBUG && existingChunk) {
        console.log(
          `[CLIENT] 🔍 J${id} arrived, existing chunk status: ${existingChunk._status}, has listeners: ${
            (existingChunk as any)._listeners?.length ?? 0
          }`,
        );
      }

      // Only skip if chunk is already INITIALIZED (actively being used by React)
      // RESOLVED_MODEL chunks can be updated - /rsc is authoritative over inline
      if (existingChunk && existingChunk._status === INITIALIZED) {
        if (DEBUG) {
          console.log(
            `[CLIENT] ⏭️ Chunk ${id} already INITIALIZED, skipping /rsc update`,
          );
        }
        return;
      }

      // Allow RESOLVED_MODEL to be updated by /rsc (fixes inline vs /rsc conflicts)
      if (existingChunk && existingChunk._status === RESOLVED_MODEL) {
        if (DEBUG) {
          console.log(
            `[CLIENT] 🔄 Chunk ${id} updating RESOLVED_MODEL with /rsc value`,
          );
        }
        const modelChunk = existingChunk as any as ResolvedModelChunk;
        modelChunk.value = value; // Replace with /rsc value
        return;
      }

      if (existingChunk) {
        // Update existing PENDING/BLOCKED chunk to RESOLVED_MODEL
        // Wake listeners FIRST before changing status, in case they're waiting
        if (
          existingChunk._status === PENDING || existingChunk._status === BLOCKED
        ) {
          wakeChunkListeners(existingChunk as PendingChunk, value);
        }

        const modelChunk = existingChunk as any as ResolvedModelChunk;
        modelChunk._status = RESOLVED_MODEL;
        modelChunk.value = value; // Raw JSON, NOT parsed

        if (DEBUG) {
          console.log(
            `[CLIENT] ✅ Chunk ${id} resolved (PENDING/BLOCKED → RESOLVED_MODEL)`,
          );
        }
      } else {
        // Create new RESOLVED_MODEL chunk
        const modelChunk: ResolvedModelChunk = {
          _status: RESOLVED_MODEL,
          value: value, // Raw JSON, NOT parsed
          reason: null,
          _response: context,
        };
        context.chunks.set(id, modelChunk);

        if (DEBUG) {
          console.log(`[CLIENT] ✅ Chunk ${id} stored as RESOLVED_MODEL`);
        }
      }
      break;
    }

    case "M": {
      // Module chunk - load module and store as INITIALIZED
      const moduleRef = value as ModuleReference;
      const cacheKey = `${moduleRef.id}#${moduleRef.name}`;

      if (DEBUG) {
        console.log(
          `[CLIENT] 📚 Loading module: ${moduleRef.id}#${moduleRef.name}`,
        );
      }

      // Load module (with caching)
      if (!context.moduleCache.has(cacheKey)) {
        const modulePromise = loadClientModule(moduleRef, context.moduleLoader);
        context.moduleCache.set(cacheKey, modulePromise);
      }

      const module = await context.moduleCache.get(cacheKey);

      if (existingChunk && existingChunk._status !== PENDING) {
        console.warn(
          `[CLIENT] ⚠️ Module chunk ${id} already exists with status ${existingChunk._status}`,
        );
        return;
      }

      if (existingChunk) {
        // Update existing PENDING chunk to INITIALIZED
        const initializedChunk = existingChunk as any as InitializedChunk;
        initializedChunk._status = INITIALIZED;
        initializedChunk.value = module;

        if (DEBUG) {
          console.log(
            `[CLIENT] ✅ Module chunk ${id} resolved (PENDING → INITIALIZED)`,
          );
        }

        // Wake listeners
        wakeChunkListeners(existingChunk as PendingChunk, module);
      } else {
        // Create new INITIALIZED chunk
        const initializedChunk: InitializedChunk = {
          _status: INITIALIZED,
          value: module,
          reason: null,
          _response: context,
        };
        context.chunks.set(id, initializedChunk);

        if (DEBUG) {
          console.log(`[CLIENT] ✅ Module chunk ${id} stored as INITIALIZED`);
        }
      }
      break;
    }

    case "E": {
      // Error chunk - create error and store as ERRORED
      const error = new Error(value.message);
      if (value.stack) {
        error.stack = value.stack;
      }

      if (existingChunk && existingChunk._status !== PENDING) {
        console.warn(
          `[CLIENT] ⚠️ Error chunk ${id} already exists with status ${existingChunk._status}`,
        );
        return;
      }

      if (existingChunk) {
        // Update existing PENDING chunk to ERRORED
        const erroredChunk = existingChunk as any as ErroredChunk;
        erroredChunk._status = ERRORED;
        erroredChunk.reason = error;

        if (DEBUG) {
          console.log(
            `[CLIENT] ❌ Chunk ${id} errored (PENDING → ERRORED)`,
            error.message,
          );
        }

        // Reject listeners
        rejectChunkListeners(existingChunk as PendingChunk, error);
      } else {
        // Create new ERRORED chunk
        const erroredChunk: ErroredChunk = {
          _status: ERRORED,
          value: null,
          reason: error,
          _response: context,
        };
        context.chunks.set(id, erroredChunk);

        if (DEBUG) {
          console.log(
            `[CLIENT] ❌ Chunk ${id} stored as ERRORED`,
            error.message,
          );
        }
      }
      break;
    }

    default:
      if (DEBUG) {
        console.warn(`[CLIENT] ⚠️ Unknown chunk type: ${type}`);
      }
      return;
  }
}

/**
 * Parse RSC stream with lazy evaluation for progressive rendering
 *
 * Returns a component function (not an element!) that React can call.
 * The component uses readChunk() for lazy initialization, enabling
 * progressive Suspense with correct boundary targeting.
 *
 * @param stream RSC wire format stream from server
 * @param moduleLoader Optional custom module loader for client components
 * @returns Promise resolving to a React component function
 */
export function createFromReadableStream(
  stream: ReadableStream<Uint8Array>,
  moduleLoader: ModuleLoader = defaultModuleLoader,
): Promise<any> {
  const context: ClientContext = {
    chunks: new Map(),
    moduleCache: new Map(),
    moduleLoader,
    _closed: false,
    _closedReason: null,
  };

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let chunkCount = 0;

  // Promise that resolves when chunk 0 (root) arrives
  let resolveRootChunk!: () => void;
  const _rootChunkReady = new Promise<void>((resolve) => {
    resolveRootChunk = resolve;
  });

  // Start processing stream in background
  const streamStartTime = Date.now();
  const _streamComplete = (async () => {
    try {
      while (true) {
        const readStartTime = Date.now();
        const { done, value } = await reader.read();
        const readDuration = Date.now() - readStartTime;

        // Log when data arrives from network
        if (DEBUG && value && value.length > 0) {
          const elapsed = ((Date.now() - streamStartTime) / 1000).toFixed(1);
          console.log(
            `[CLIENT] 📡 Stream data received at T+${elapsed}s (waited ${readDuration}ms, ${value.length} bytes)`,
          );
        }

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          const chunk = parseChunk(line);
          if (chunk) {
            chunkCount++;
            const elapsed = ((Date.now() - streamStartTime) / 1000).toFixed(1);
            if (DEBUG) {
              console.log(
                `[CLIENT] Chunk ${chunkCount}: ${chunk.type}${chunk.id} at T+${elapsed}s`,
              );
            }
            await processChunk(chunk, context);

            // Notify when root chunk arrives
            if (chunk.id === 0) {
              if (DEBUG) console.log("[CLIENT] 🎯 Root chunk (ID 0) received!");
              resolveRootChunk();
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const chunk = parseChunk(buffer);
        if (chunk) {
          chunkCount++;
          if (DEBUG) {
            console.log(
              `[CLIENT] Chunk ${chunkCount}: ${chunk.type}${chunk.id}`,
            );
          }
          await processChunk(chunk, context);

          // Notify when root chunk arrives
          if (chunk.id === 0) {
            if (DEBUG) console.log("[CLIENT] 🎯 Root chunk (ID 0) received!");
            resolveRootChunk();
          }
        }
      }

      if (DEBUG) {
        console.log(`[CLIENT] ✅ Stream complete. Total chunks: ${chunkCount}`);
      }
    } catch (error) {
      console.error("[CLIENT] ❌ Stream processing error:", error);
      context._closed = true;
      context._closedReason = error as Error;
      throw error;
    } finally {
      context._closed = true;
      reader.releaseLock();
    }
  })();

  // DON'T wait - return immediately and let React suspend if chunk 0 isn't ready
  if (DEBUG) {
    console.log(
      "[CLIENT] ✅ Returning RSC component (stream processing in background)",
    );
  }

  // Return a component FUNCTION (not element!) that uses lazy evaluation
  // React calls readChunk() during render, enabling progressive Suspense
  return Promise.resolve(function RSCTreeRoot() {
    if (DEBUG) {
      console.log("[CLIENT] 🎯 RSCTreeRoot rendering - reading root chunk");
    }

    // Get chunk 0 - might be PENDING, RESOLVED_MODEL, or INITIALIZED
    const rootChunk = context.chunks.get(0);

    // If chunk 0 hasn't arrived yet, create a PENDING chunk and throw it
    if (!rootChunk) {
      if (DEBUG) {
        console.log(
          "[CLIENT] 🔮 Root chunk not yet available - creating PENDING",
        );
      }
      const pending = createPendingChunk(context);
      context.chunks.set(0, pending);

      // When chunk 0 arrives, it will resolve this pending chunk
      throw pending;
    }

    // Read chunk - will initialize if RESOLVED_MODEL, throw if PENDING
    let root = readChunk(rootChunk);

    // Handle Fragment unwrapping
    if (
      root !== null && typeof root === "object" && "children" in root &&
      !root.$$typeof
    ) {
      const keys = Object.keys(root);
      if (keys.length === 1 && keys[0] === "children") {
        if (Array.isArray(root.children)) {
          root = createElement(
            Fragment,
            null,
            ...applyChildKeys(root.children),
          );
        } else {
          root = root.children;
        }
      }
    }

    return root;
  });
}

/**
 * Create React tree from a fetch response
 *
 * Convenience wrapper around createFromReadableStream that handles
 * the HTTP response and extracts the stream body.
 *
 * @param fetchPromise Promise that resolves to the fetch Response
 * @param moduleLoader Optional custom module loader
 * @returns Promise resolving to the root React element
 */
export async function createFromFetch(
  fetchPromise: Promise<Response>,
  moduleLoader?: ModuleLoader,
): Promise<any> {
  const response = await fetchPromise;

  if (!response.ok) {
    throw new Error(
      `RSC fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("RSC response has no body");
  }

  if (DEBUG) {
    console.log("[CLIENT] Fetching RSC from:", response.url);
    console.log("[CLIENT] Response status:", response.status);
  }

  return createFromReadableStream(response.body, moduleLoader);
}

/**
 * Create React tree from embedded RSC payload (for SSR hydration)
 *
 * This function is used for hydration when the RSC payload is embedded
 * in the HTML document instead of being fetched from the /rsc endpoint.
 *
 * @param payload The pre-parsed RSC chunks from embedded script tag
 * @param moduleLoader Optional custom module loader
 * @returns Promise resolving to a React component function
 */
export async function createFromPayload(
  payload: RSCChunk[],
  moduleLoader: ModuleLoader = defaultModuleLoader,
): Promise<any> {
  if (DEBUG) {
    console.log("[CLIENT] Creating React tree from embedded payload");
    console.log(`[CLIENT] Payload has ${payload.length} chunks`);
  }

  const context: ClientContext = {
    chunks: new Map(),
    moduleCache: new Map(),
    moduleLoader,
    _closed: true, // Payload is already complete
    _closedReason: null,
  };

  // Process all chunks - await each one since processChunk is async (for module loading)
  for (const chunk of payload) {
    await processChunk(chunk, context);
  }

  if (DEBUG) {
    console.log(
      `[CLIENT] Processed ${context.chunks.size} chunks from payload`,
    );
  }

  // Return a component FUNCTION (not element!) that uses lazy evaluation
  // This is the same pattern as createFromReadableStream
  // Since this is an async function, we return the function directly (no need for Promise.resolve)
  return function RSCTreeRootFromPayload() {
    if (DEBUG) {
      console.log(
        "[CLIENT] 🎯 RSCTreeRootFromPayload rendering - reading root chunk",
      );
    }

    // Get chunk 0 - should be RESOLVED_MODEL or INITIALIZED
    const rootChunk = context.chunks.get(0);

    if (!rootChunk) {
      throw new Error("Root chunk (ID 0) not found in RSC payload");
    }

    // Read chunk - will initialize if RESOLVED_MODEL
    let root = readChunk(rootChunk);

    // Handle Fragment unwrapping (same as createFromReadableStream)
    if (
      root !== null && typeof root === "object" && "children" in root &&
      !root.$$typeof
    ) {
      const keys = Object.keys(root);
      if (keys.length === 1 && keys[0] === "children") {
        if (Array.isArray(root.children)) {
          root = createElement(
            Fragment,
            null,
            ...applyChildKeys(root.children),
          );
        } else {
          root = root.children;
        }
      }
    }

    return root;
  };
}

/**
 * Create a React element from a specific chunk in the RSC payload
 * Used for islands architecture to hydrate individual client components
 *
 * @param payload The RSC chunks from embedded payload
 * @param chunkId The chunk ID to start parsing from
 * @param moduleLoader Custom module loader for client components
 * @returns Promise resolving to a React element
 */
export async function createElementFromChunk(
  payload: RSCChunk[],
  chunkId: number,
  moduleLoader: ModuleLoader = defaultModuleLoader,
): Promise<any> {
  if (DEBUG) {
    console.log(`[CLIENT] 🏝️ Creating element from chunk ${chunkId}`);
  }

  const context: ClientContext = {
    chunks: new Map(),
    moduleCache: new Map(),
    moduleLoader,
    _closed: true, // Payload is already complete
    _closedReason: null,
  };

  // Process all chunks - we need them all for reference resolution
  for (const chunk of payload) {
    await processChunk(chunk, context);
  }

  // Get the specified chunk
  const targetChunk = context.chunks.get(chunkId);
  if (!targetChunk) {
    throw new Error(`Chunk ${chunkId} not found in RSC payload`);
  }

  if (DEBUG) {
    console.log(
      `[CLIENT] 🏝️ Target chunk ${chunkId} status: ${targetChunk._status}`,
    );
  }

  // Read the chunk - this will parse and resolve all references
  const element = readChunk(targetChunk);

  if (DEBUG) {
    console.log(`[CLIENT] 🏝️ Created element from chunk ${chunkId}:`, element);
  }

  return element;
}

/**
 * Check if the page has embedded RSC payload for hydration
 * @returns True if RSC payload script tag exists
 */
export function hasEmbeddedPayload(): boolean {
  if (typeof document === "undefined") return false;
  return document.getElementById("__RSC_PAYLOAD__") !== null;
}

/**
 * Get embedded RSC payload from the HTML document
 * @returns Parsed RSC chunks or null if not found
 */
export function getEmbeddedPayload(): RSCChunk[] | null {
  if (typeof document === "undefined") return null;

  const payloadElement = document.getElementById("__RSC_PAYLOAD__");
  if (!payloadElement) return null;

  try {
    const payloadText = payloadElement.textContent;
    if (!payloadText) return null;

    const parsed = JSON.parse(payloadText);

    if (DEBUG) {
      console.log("[CLIENT] Parsed embedded RSC payload:", parsed);
    }

    return parsed as RSCChunk[];
  } catch (error) {
    console.error("[CLIENT] Failed to parse embedded RSC payload:", error);
    return null;
  }
}

// ============================================================================
// Streaming Optimal RSC Support
// ============================================================================

/**
 * Check if streaming-optimal mode is being used
 * @returns True if RSC bootstrap script exists
 */
export function hasStreamingOptimalRSC(): boolean {
  if (typeof document === "undefined") return false;
  return document.getElementById("__RSC_INLINE_BOOTSTRAP__") !== null;
}

/**
 * Check if RSC streaming is complete
 * @returns True if all chunks have been received
 */
export function isStreamingOptimalComplete(): boolean {
  if (typeof globalThis === "undefined") return false;
  // Type assertion needed: accessing RSC streaming runtime globals set by inline bootstrap script
  return (globalThis as any).__RSC_STREAMING_COMPLETE__ === true;
}

/**
 * Get buffered RSC chunks
 * @returns Array of buffered chunks or empty array
 */
export function getStreamingOptimalBuffer(): RSCChunk[] {
  if (typeof globalThis === "undefined") return [];
  // Type assertion needed: accessing RSC streaming runtime globals set by inline bootstrap script
  return (globalThis as any).__RSC_CHUNKS_BUFFER__ ?? [];
}

/**
 * Create React tree from streaming-optimal mode
 *
 * This function is used when RSC chunks are injected inline as <script> tags.
 * It processes buffered chunks and sets up a handler for future chunks.
 *
 * @param moduleLoader Optional custom module loader
 * @returns Promise resolving to a React component function
 */
export async function createFromStreamingOptimal(
  moduleLoader: ModuleLoader = defaultModuleLoader,
): Promise<any> {
  if (DEBUG) {
    console.log("[CLIENT] Creating React tree from streaming-optimal mode");
  }

  const context: ClientContext = {
    chunks: new Map(),
    moduleCache: new Map(),
    moduleLoader,
    _closed: false,
    _closedReason: null,
  };

  // Process buffered chunks first
  const bufferedChunks = getStreamingOptimalBuffer();
  if (DEBUG) {
    console.log(`[CLIENT] Processing ${bufferedChunks.length} buffered chunks`);
  }

  for (const chunk of bufferedChunks) {
    await processChunk(chunk, context);
  }

  // Set up handler for future chunks (replacing the buffer)
  // Type assertion needed: setting RSC streaming runtime globals for inline script chunks
  (globalThis as any).__RSC_CHUNK__ = async (chunk: RSCChunk) => {
    if (DEBUG) {
      console.log(`[CLIENT] Processing inline chunk: ${chunk.type}${chunk.id}`);
    }
    await processChunk(chunk, context);
  };

  // Mark context as closed when streaming completes
  const checkComplete = () => {
    if (isStreamingOptimalComplete()) {
      context._closed = true;
      if (DEBUG) {
        console.log("[CLIENT] Streaming-optimal RSC complete");
      }
    } else {
      // Check again in the next frame
      requestAnimationFrame(checkComplete);
    }
  };
  checkComplete();

  // Return a component FUNCTION that uses lazy evaluation
  return function RSCTreeRootFromStreamingOptimal() {
    if (DEBUG) {
      console.log(
        "[CLIENT] 🎯 RSCTreeRootFromStreamingOptimal rendering - reading root chunk",
      );
    }

    // Get chunk 0 - might be PENDING if not yet received
    const rootChunk = context.chunks.get(0);

    if (!rootChunk) {
      if (DEBUG) {
        console.log(
          "[CLIENT] 🔮 Root chunk not yet available - creating PENDING",
        );
      }
      const pending = createPendingChunk(context);
      context.chunks.set(0, pending);
      throw pending;
    }

    // Read chunk - will initialize if RESOLVED_MODEL, throw if PENDING
    let root = readChunk(rootChunk);

    // Handle Fragment unwrapping
    if (
      root !== null && typeof root === "object" && "children" in root &&
      !root.$$typeof
    ) {
      const keys = Object.keys(root);
      if (keys.length === 1 && keys[0] === "children") {
        if (Array.isArray(root.children)) {
          root = createElement(
            Fragment,
            null,
            ...applyChildKeys(root.children),
          );
        } else {
          root = root.children;
        }
      }
    }

    return root;
  };
}

/**
 * Create React tree from hybrid sources for optimal hydration:
 * - Inline payload: sync chunks (instant hydration, no network wait)
 * - /rsc stream: async chunks (progressive updates, single execution)
 *
 * Both sources feed into the same context, enabling:
 * - Instant hydration for sync components (from inline payload)
 * - Progressive updates for async components (from /rsc stream)
 * - No duplicate execution of async components (only run on server via /rsc)
 *
 * @param inlinePayload Pre-parsed RSC chunks from embedded script tag (sync only)
 * @param rscFetchPromise Promise for the /rsc fetch (provides async chunks)
 * @param moduleLoader Optional custom module loader
 * @returns Promise resolving to a React component function
 */
export function createHybridRSCTree(
  inlinePayload: RSCChunk[] | null,
  rscFetchPromise: Promise<Response>,
  moduleLoader: ModuleLoader = defaultModuleLoader,
): Promise<any> {
  if (DEBUG) {
    console.log("[CLIENT] 🔄 Creating hybrid RSC tree (inline + /rsc)");
  }

  const context: ClientContext = {
    chunks: new Map(),
    moduleCache: new Map(),
    moduleLoader,
    _closed: false,
    _closedReason: null,
  };

  // 1. Skip inline chunks entirely for now
  // The inline (SSR) and /rsc chunk ID schemes are incompatible:
  // - Same chunk ID has different content in each (e.g., element vs props)
  // - This causes React error #31 and other issues
  // Until SSR generates compatible chunks, we rely solely on /rsc
  if (inlinePayload && inlinePayload.length > 0) {
    if (DEBUG) {
      console.log(
        `[CLIENT] ⏭️ Skipping ${inlinePayload.length} inline chunks (incompatible with /rsc ID scheme)`,
      );
    }
  }

  // Create PENDING for root chunk - /rsc will provide the real data
  const rootPending = createPendingChunk(context);
  context.chunks.set(0, rootPending);

  // 2. Start processing /rsc stream in background (async components)
  // This runs concurrently - React will render sync content immediately
  // and update async content as chunks arrive from /rsc
  (async () => {
    const streamStartTime = Date.now();
    try {
      if (DEBUG) {
        console.log("[CLIENT] 📡 Connecting to /rsc for async chunks...");
      }

      const response = await rscFetchPromise;
      if (!response.ok) {
        throw new Error(
          `RSC fetch failed: ${response.status} ${response.statusText}`,
        );
      }
      if (!response.body) {
        throw new Error("RSC response has no body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = parseChunk(line);
          if (chunk) {
            chunkCount++;
            const elapsed = ((Date.now() - streamStartTime) / 1000).toFixed(1);
            if (DEBUG) {
              console.log(
                `[CLIENT] 📡 /rsc chunk ${chunkCount}: ${chunk.type}${chunk.id} at T+${elapsed}s`,
              );
            }

            // This updates/adds chunks to context
            // If chunk already exists (from inline), it gets updated
            // If chunk is new (async), it's added and wakes listeners
            await processChunk(chunk, context);
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const chunk = parseChunk(buffer);
        if (chunk) {
          chunkCount++;
          if (DEBUG) {
            console.log(
              `[CLIENT] 📡 /rsc final chunk: ${chunk.type}${chunk.id}`,
            );
          }
          await processChunk(chunk, context);
        }
      }

      if (DEBUG) {
        const elapsed = ((Date.now() - streamStartTime) / 1000).toFixed(1);
        console.log(
          `[CLIENT] ✅ /rsc stream complete at T+${elapsed}s (${chunkCount} chunks)`,
        );
      }

      reader.releaseLock();
    } catch (error) {
      console.error("[CLIENT] ❌ /rsc stream error:", error);
      context._closedReason = error as Error;
    } finally {
      context._closed = true;
    }
  })();

  // 3. Return Promise that resolves to a component that reads from unified context
  // React will render what's available immediately (sync from inline)
  // and suspend on PENDING chunks (async from /rsc)
  // Wrapped in Promise.resolve to match the Promise<any> return type for use() hook
  return Promise.resolve(function RSCTreeRootHybrid() {
    if (DEBUG) {
      console.log(
        "[CLIENT] 🎯 RSCTreeRootHybrid rendering - reading root chunk",
      );
    }

    const rootChunk = context.chunks.get(0);

    if (!rootChunk) {
      // Root not yet available - create pending and suspend
      if (DEBUG) {
        console.log(
          "[CLIENT] 🔮 Root chunk not yet available - creating PENDING",
        );
      }
      const pending = createPendingChunk(context);
      context.chunks.set(0, pending);
      throw pending;
    }

    // Read chunk - will throw if PENDING (async not yet resolved)
    let root = readChunk(rootChunk);

    // Handle Fragment unwrapping
    if (
      root !== null &&
      typeof root === "object" &&
      "children" in root &&
      !root.$$typeof
    ) {
      const keys = Object.keys(root);
      if (keys.length === 1 && keys[0] === "children") {
        if (Array.isArray(root.children)) {
          root = createElement(
            Fragment,
            null,
            ...applyChildKeys(root.children),
          );
        } else {
          root = root.children;
        }
      }
    }

    return root;
  });
}
