// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * React Flight Client - RSC Parser for the Browser
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

/* oxlint-disable typescript/no-explicit-any */
// Note: This RSC protocol parser uses 'any' extensively for:
// - Dynamic JSON payloads from wire protocol
// - React elements with polymorphic types
// - Promise/thenable chunk handlers
// - State machine chunk transitions

import * as React from "react";
import * as logging from "@eserstack/logging";
import * as protocol from "./protocol.ts";
import type {
  ModuleReference,
  RSCChunk,
  ServerActionReference,
} from "./protocol.ts";

// Taken on first use, not at import. In the browser this is laroux's browser
// logger, which client builds put in place of @eserstack/logging.
const getClientLogger = () =>
  logging.logger.getLogger(["laroux-bundler", "rsc-client"]);

/**
 * Apply keys to children array using React.Children.toArray()
 * This is React's standard way of handling child arrays and adds stable keys
 * Used to avoid "Each child in a list should have a unique key" warnings
 */
function applyChildKeys(children: any[]): any[] {
  return React.Children.toArray(children);
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
  moduleCache: Map<string, Promise<unknown>>;
  moduleLoader: ModuleLoader;
  _closed: boolean; // Has the stream been closed?
  _closedReason: Error | null; // Error that caused stream to close (if any)
}

/**
 * Loads the export that a module chunk (`M`) names.
 *
 * Returns the export, or a promise of it. Its type is known only to the module
 * that exports it: usually a component, and the whole module for the name
 * `"*"`. Code that renders the value narrows it first.
 */
export type ModuleLoader = (id: string, name: string) => unknown;

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
  // Use readChunk which handles initialization and throwing for Suspense
  return readChunk(chunk);
}

/**
 * Default module loader using dynamic import
 */
const defaultModuleLoader: ModuleLoader = async (id: string, name: string) => {
  let module;
  try {
    module = await import(id);
  } catch (error) {
    throw new Error(
      `load client module ${id}#${name}: check that the module is in the client bundle`,
      { cause: error },
    );
  }

  if (name === "default") {
    return module.default;
  } else if (name === "*") {
    return module;
  } else {
    return module[name];
  }
};

/**
 * Load a client module using the provided loader
 */
async function loadClientModule(
  moduleRef: ModuleReference,
  moduleLoader: ModuleLoader,
): Promise<unknown> {
  const { id, name } = moduleRef;
  return await moduleLoader(id, name);
}

/**
 * Create the state a stream's chunks are collected in.
 *
 * @param closed Whether no more chunks will arrive, as for an embedded payload
 */
function createClientContext(
  moduleLoader: ModuleLoader,
  closed: boolean,
): ClientContext {
  return {
    chunks: new Map(),
    moduleCache: new Map(),
    moduleLoader,
    _closed: closed,
    _closedReason: null,
  };
}

/** Turn a thrown value into an Error, keeping one that already is. */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * The error a chunk gets when its stream ended without sending it.
 */
function createStreamClosedError(id: number): Error {
  return new Error(
    `read RSC stream: the stream ended before chunk ${id} arrived; check the server log for the error that stopped the render`,
  );
}

/**
 * Create a new pending chunk (forward reference)
 * Returns a Thenable with a listener queue that React can suspend on
 */
function createPendingChunk(context: ClientContext): PendingChunk {
  const thenable: PendingChunk = {
    _status: PENDING,
    status: "pending",
    value: null,
    reason: null,
    _response: context,
    _listeners: [],
    then(onResolve: (value: any) => void, onReject?: (error: any) => void) {
      // The chunk object changes state in place. One that settled before this
      // call has already notified its listeners, so it answers from its state.
      const current = thenable as unknown as Chunk;
      if (current._status === ERRORED) {
        return Promise.reject(current.reason).then(onResolve, onReject);
      }
      if (current._status !== PENDING && current._status !== BLOCKED) {
        return Promise.resolve(current.value).then(onResolve, onReject);
      }

      // Create a promise that gets resolved when chunk arrives
      const promise = new Promise<any>((resolve, reject) => {
        current._listeners.push({ resolve, reject });
      });
      return promise.then(onResolve, onReject);
    },
  };

  return thenable;
}

/**
 * Move a PENDING chunk to ERRORED and reject its listeners, so the Suspense
 * boundary that is waiting on it retries and the error reaches the error
 * boundary.
 */
function rejectPendingChunk(chunk: PendingChunk, error: Error): void {
  // Double assertion needed: chunk state transition from PENDING to ERRORED
  const erroredChunk = chunk as any as ErroredChunk;
  erroredChunk._status = ERRORED;
  erroredChunk.reason = error;

  rejectChunkListeners(chunk, error);
}

/**
 * Store an error for a chunk id: a PENDING chunk moves to ERRORED and its
 * listeners are rejected, and a chunk that has not been referenced yet is
 * created as ERRORED.
 *
 * @returns false when the chunk already holds a value, which it keeps
 */
function storeErroredChunk(
  context: ClientContext,
  id: number,
  error: Error,
): boolean {
  const existingChunk = context.chunks.get(id);

  if (existingChunk === undefined) {
    const erroredChunk: ErroredChunk = {
      _status: ERRORED,
      value: null,
      reason: error,
      _response: context,
    };
    context.chunks.set(id, erroredChunk);
    return true;
  }

  if (existingChunk._status !== PENDING) {
    return false;
  }

  rejectPendingChunk(existingChunk, error);
  return true;
}

/**
 * Mark the stream that feeds a context as finished.
 *
 * A chunk that is still PENDING will never arrive, so it moves to ERRORED
 * and its listeners are rejected: the Suspense boundary that waits on it
 * shows the error instead of waiting forever. Chunks referenced later fail
 * in getChunk the same way.
 *
 * @param reason The error the stream failed with, or null when it ended
 */
function closeContext(context: ClientContext, reason: Error | null): void {
  context._closed = true;
  context._closedReason = reason;

  for (const [id, chunk] of context.chunks) {
    if (chunk._status === PENDING) {
      rejectPendingChunk(chunk, reason ?? createStreamClosedError(id));
    }
  }
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
      initializeModelChunk(chunk as ResolvedModelChunk);
      break;
    case RESOLVED_MODULE:
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
    const error = context._closedReason ?? createStreamClosedError(id);
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

    // Wake any blocked listeners
    wakeChunkListeners(blockedChunk, value);
  } catch (error) {
    // Check if this is a Suspense throw (PENDING/BLOCKED chunk)
    // If so, re-throw it - don't treat it as an error!
    // Type assertion needed: checking if thrown error is a pending chunk (Suspense throw pattern)
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      ((error as any)._status === PENDING || (error as any)._status === BLOCKED)
    ) {
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

    // Reject blocked listeners. The error reaches React when the chunk is
    // read, and the error boundary that catches it reports it.
    rejectChunkListeners(blockedChunk, error as Error);
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
  if (protocol.isReactElement(model)) {
    return model;
  }

  // Serialized React elements (from RSC payload, with string $$typeof) - convert to real element
  // Handle both "react.element" and "react.transitional.element" (React 19)
  const typeofValue = model.$$typeof ?? model.$typeof;

  if (
    typeofValue === "react.element" ||
    typeofValue === "react.transitional.element"
  ) {
    return parseReactElement(model, context);
  }

  // Plain objects - parse properties. Object.fromEntries defines each key as
  // an own property, so a "__proto__" key from the stream stays data and does
  // not replace the object's prototype.
  if (Object.getPrototypeOf(model) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(model).map(([key, val]) => [
        key,
        parseModel(val, context),
      ]),
    );
  }

  return model;
}

/**
 * Read the chunk id written after a reference prefix, such as "12" in "$12"
 * or "$Q12"; null when the text is not a decimal id.
 */
function parseChunkId(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * The chunk id of a plain reference such as "$12"; null for every other
 * value, tagged values and escaped strings included.
 */
function parseChunkReference(value: unknown): number | null {
  return typeof value === "string" && value.startsWith("$")
    ? parseChunkId(value.slice(1))
    : null;
}

/** Digits of a BigInt as the server writes them after its tag. */
const BIGINT_DIGITS = /^-?\d+$/;

/**
 * Parse a string that starts with "$": a reference to another chunk, a value
 * JSON cannot hold, or an escaped string (protocol.RSC_VALUE_TAGS)
 *
 * @param ref The $ string (e.g., "$79", "$M123", "$F456", "$D2026-01-02T...")
 * @param context The client context
 * @returns The value the string stands for
 */
function parseReference(ref: string, context: ClientContext): any {
  const tags = protocol.RSC_VALUE_TAGS;

  // A string the server escaped because it starts with "$"
  if (ref.startsWith(tags.escaped)) {
    return ref.slice(1);
  }

  switch (ref) {
    case tags.undefined:
      return undefined;
    case tags.nan:
      return NaN;
    case tags.infinity:
      return Infinity;
    case tags.negativeInfinity:
      return -Infinity;
    case tags.negativeZero:
      return -0;
  }

  if (ref.startsWith(tags.date)) {
    return new Date(ref.slice(tags.date.length));
  }

  if (ref.startsWith(tags.bigint)) {
    const digits = ref.slice(tags.bigint.length);
    return BIGINT_DIGITS.test(digits) ? BigInt(digits) : ref;
  }

  // A Map or a Set: the referenced chunk holds its entries or values
  const isMap = ref.startsWith(tags.map);
  if (isMap || ref.startsWith(tags.set)) {
    const tag = isMap ? tags.map : tags.set;
    const id = parseChunkId(ref.slice(tag.length));
    if (id === null) {
      return ref;
    }

    const items = readChunk(getChunk(id, context));
    return isMap ? new Map(items) : new Set(items);
  }

  // Handle different reference types:
  // - $M123: Module reference
  // - $F123: Server action (function) reference
  // - $123: Regular JSON reference
  const id =
    ref.startsWith("$M") || ref.startsWith("$F")
      ? parseChunkId(ref.slice(2))
      : parseChunkId(ref.slice(1));

  if (id === null) {
    // Not a valid reference, return as-is
    return ref;
  }

  // Get or create chunk (might be PENDING if forward reference)
  const chunk = getChunk(id, context);

  // Read chunk - will throw if PENDING
  return readChunk(chunk);
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
    const propsId = parseChunkReference(rawProps);
    if (propsId !== null) {
      const propsChunk = getChunk(propsId, context);
      // For RESOLVED_MODEL, get the raw JSON value
      if (
        propsChunk._status === RESOLVED_MODEL ||
        propsChunk._status === INITIALIZED
      ) {
        rawProps = propsChunk.value;
      }
    }

    // Check if raw props has children that's a reference. A tagged value or
    // an escaped string ("$$5 off") is not one.
    const childId =
      rawProps !== null && typeof rawProps === "object"
        ? parseChunkReference(rawProps.children)
        : null;

    if (childId !== null) {
      const childChunk = getChunk(childId, context);

      // Check if child is PENDING or indirect PENDING reference
      let shouldWrap = childChunk._status === PENDING;

      if (!shouldWrap && childChunk._status === RESOLVED_MODEL) {
        const indirectId = parseChunkReference(childChunk.value);
        if (
          indirectId !== null &&
          getChunk(indirectId, context)._status === PENDING
        ) {
          shouldWrap = true;
        }
      }

      if (shouldWrap) {
        // Build props manually: parse fallback separately
        const { children: _, fallback, ...otherRawProps } = rawProps;

        // Parse fallback - it could be a reference like "$252" or a plain object
        // Use parseModel to resolve references and reconstruct React elements
        const parsedFallback =
          fallback === undefined ? undefined : parseModel(fallback, context);

        // Parse other props (excluding children and fallback)
        const parsedOtherProps =
          Object.keys(otherRawProps).length > 0
            ? parseModel(otherRawProps, context)
            : {};

        // Return Suspense with ChunkReader as children
        return React.createElement(
          type,
          { ...parsedOtherProps, fallback: parsedFallback },
          React.createElement(ChunkReader, { chunk: childChunk }),
        );
      }
    }
  }

  // Normal element - parse props
  const props = parseModel(element.props, context);

  // Handle children arrays to avoid React key warnings
  // When children is an array, use Children.toArray() for stable keys
  if (
    props !== null &&
    typeof props === "object" &&
    Array.isArray(props.children)
  ) {
    const { children, ...restProps } = props;
    const keyedChildren = applyChildKeys(children);

    return React.createElement(type, restProps, ...keyedChildren);
  }

  return React.createElement(type, props);
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

  // Get existing chunk (might be PENDING forward reference)
  const existingChunk = context.chunks.get(id);

  switch (type) {
    case "J": {
      // JSON chunk - store as RESOLVED_MODEL WITHOUT parsing

      // Only skip if chunk is already INITIALIZED (actively being used by React)
      // RESOLVED_MODEL chunks can be updated - /rsc is authoritative over inline
      if (existingChunk && existingChunk._status === INITIALIZED) {
        return;
      }

      // Allow RESOLVED_MODEL to be updated by /rsc (fixes inline vs /rsc conflicts)
      if (existingChunk && existingChunk._status === RESOLVED_MODEL) {
        const modelChunk = existingChunk as any as ResolvedModelChunk;
        modelChunk.value = value; // Replace with /rsc value
        return;
      }

      if (existingChunk) {
        // Update existing PENDING/BLOCKED chunk to RESOLVED_MODEL
        // Wake listeners FIRST before changing status, in case they're waiting
        if (
          existingChunk._status === PENDING ||
          existingChunk._status === BLOCKED
        ) {
          wakeChunkListeners(existingChunk as PendingChunk, value);
        }

        const modelChunk = existingChunk as any as ResolvedModelChunk;
        modelChunk._status = RESOLVED_MODEL;
        modelChunk.value = value; // Raw JSON, NOT parsed
      } else {
        // Create new RESOLVED_MODEL chunk
        const modelChunk: ResolvedModelChunk = {
          _status: RESOLVED_MODEL,
          value: value, // Raw JSON, NOT parsed
          reason: null,
          _response: context,
        };
        context.chunks.set(id, modelChunk);
      }
      break;
    }

    case "M": {
      // Module chunk - load module and store as INITIALIZED
      const moduleRef = value as ModuleReference;
      const cacheKey = `${moduleRef.id}#${moduleRef.name}`;

      // Load module (with caching)
      if (!context.moduleCache.has(cacheKey)) {
        const modulePromise = loadClientModule(moduleRef, context.moduleLoader);
        context.moduleCache.set(cacheKey, modulePromise);
      }

      let module: unknown;
      try {
        module = await context.moduleCache.get(cacheKey);
      } catch (error) {
        // Handled here: the failure is stored on this chunk only, so the rest
        // of the stream still applies, and the error boundary that renders
        // the chunk reports it.
        storeErroredChunk(context, id, toError(error));
        return;
      }

      // Read the chunk again: while the module loaded, React may have
      // rendered a reference to it and created a PENDING chunk for this id.
      const currentChunk = context.chunks.get(id);

      if (currentChunk !== undefined && currentChunk._status !== PENDING) {
        await getClientLogger().warn(
          `RSC module chunk M${id} arrived twice; keeping the first one (status ${currentChunk._status})`,
        );
        return;
      }

      if (currentChunk !== undefined) {
        // Update existing PENDING chunk to INITIALIZED
        const initializedChunk = currentChunk as any as InitializedChunk;
        initializedChunk._status = INITIALIZED;
        initializedChunk.value = module;

        // Wake listeners
        wakeChunkListeners(currentChunk as PendingChunk, module);
      } else {
        // Create new INITIALIZED chunk
        const initializedChunk: InitializedChunk = {
          _status: INITIALIZED,
          value: module,
          reason: null,
          _response: context,
        };
        context.chunks.set(id, initializedChunk);
      }
      break;
    }

    case "E": {
      // Error chunk - create error and store as ERRORED
      const error = new Error(value.message);
      if (value.stack) {
        error.stack = value.stack;
      }

      if (!storeErroredChunk(context, id, error)) {
        await getClientLogger().warn(
          `RSC error chunk E${id} arrived for a chunk that already has status ${existingChunk?._status}; ignoring it`,
        );
        return;
      }
      break;
    }

    case "S": {
      // Server action reference chunk - create bound action function
      // Value can be a string (symbol reference) or ServerActionReference object
      if (typeof value === "object" && value !== null && "id" in value) {
        const actionRef = value as ServerActionReference;

        // Create a bound action function that calls __callServer
        const boundAction = async (...args: unknown[]) => {
          if (typeof (globalThis as any).__callServer !== "function") {
            throw new Error(
              "Server actions not initialized. Ensure client bootstrap provides __callServer.",
            );
          }
          // If bound args exist, prepend them
          const allArgs = actionRef.bound
            ? [...actionRef.bound, ...args]
            : args;
          return await (globalThis as any).__callServer(actionRef.id, allArgs);
        };

        // Mark with React server reference symbols
        Object.assign(boundAction, {
          $$typeof: Symbol.for("react.server.reference"),
          $$id: actionRef.id,
          $$bound: actionRef.bound,
        });

        if (existingChunk && existingChunk._status !== PENDING) {
          await getClientLogger().warn(
            `RSC server action chunk S${id} (${actionRef.id}) arrived twice; keeping the first one (status ${existingChunk._status})`,
          );
          return;
        }

        if (existingChunk) {
          // Update existing PENDING chunk to INITIALIZED
          const initializedChunk = existingChunk as any as InitializedChunk;
          initializedChunk._status = INITIALIZED;
          initializedChunk.value = boundAction;

          // Wake listeners
          wakeChunkListeners(existingChunk as PendingChunk, boundAction);
        } else {
          // Create new INITIALIZED chunk with bound action
          const initializedChunk: InitializedChunk = {
            _status: INITIALIZED,
            value: boundAction,
            reason: null,
            _response: context,
          };
          context.chunks.set(id, initializedChunk);
        }
      } else {
        // Symbol reference (original S chunk behavior) - store as string
        const initializedChunk: InitializedChunk = {
          _status: INITIALIZED,
          value: typeof value === "string" ? Symbol.for(value) : value,
          reason: null,
          _response: context,
        };
        context.chunks.set(id, initializedChunk);
      }
      break;
    }

    default:
      await getClientLogger().warn(
        `RSC chunk ${type}${id} has an unknown type "${type}"; skipping it (known types: J, M, E, S)`,
      );
      return;
  }
}

/**
 * Apply one line of the RSC wire format to a context; blank lines and lines
 * that are not a chunk are skipped.
 */
async function processStreamLine(
  line: string,
  context: ClientContext,
): Promise<void> {
  if (line.trim() === "") {
    return;
  }

  const chunk = protocol.parseChunk(line);
  if (chunk !== null) {
    await processChunk(chunk, context);
  }
}

/**
 * Read an RSC stream into a context, applying chunks in stream order, and
 * close the context when the stream ends or fails.
 *
 * Every failure is handled here, so the returned promise never rejects:
 * closing the context with the error rejects every chunk that is still
 * PENDING, and the error boundary that renders one of them reports it.
 *
 * @param source What the stream is, for the log entry of a failure
 */
async function consumeRSCStream(
  stream: ReadableStream<Uint8Array>,
  context: ClientContext,
  source: string,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      // A stream yields its parts one after another.
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        // Chunks apply in stream order: a chunk can update or wake one
        // that an earlier line created.
        // oxlint-disable-next-line no-await-in-loop
        await processStreamLine(line, context);
      }
    }

    // Process remaining buffer
    buffer += decoder.decode();
    await processStreamLine(buffer, context);

    closeContext(context, null);
  } catch (error) {
    // Handled here: the pending chunks fail with the error, so the
    // boundaries that wait on them show it instead of waiting forever.
    closeContext(context, toError(error));
    await getClientLogger().with({ error }).error(`read RSC stream ${source}`);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Unwrap a root that is a props object holding only `children`, which the
 * server sends for a fragment at the root of the tree.
 */
function unwrapRootValue(root: any): any {
  if (
    root === null ||
    typeof root !== "object" ||
    !("children" in root) ||
    root.$$typeof !== undefined
  ) {
    return root;
  }

  const keys = Object.keys(root);
  if (keys.length !== 1 || keys[0] !== "children") {
    return root;
  }

  if (Array.isArray(root.children)) {
    return React.createElement(
      React.Fragment,
      null,
      ...applyChildKeys(root.children),
    );
  }

  return root.children;
}

/**
 * Parse RSC stream with lazy evaluation for progressive rendering
 *
 * Returns a component function (not an element!) that React can call.
 * The component uses readChunk() for lazy initialization, enabling
 * progressive Suspense with correct boundary targeting.
 *
 * When the stream fails, every chunk React is still waiting for fails with
 * the stream's error, so the nearest error boundary shows it; when the
 * stream ends without a chunk, that chunk fails with an error naming it.
 *
 * @param stream RSC wire format stream from server
 * @param moduleLoader Optional custom module loader for client components
 * @returns Promise resolving to a React component function
 */
export function createFromReadableStream(
  stream: ReadableStream<Uint8Array>,
  moduleLoader: ModuleLoader = defaultModuleLoader,
): Promise<any> {
  const context = createClientContext(moduleLoader, false);

  // Process the stream in the background. consumeRSCStream handles every
  // failure itself, so this promise never rejects.
  const _streamComplete = consumeRSCStream(
    stream,
    context,
    "for the component tree",
  );

  // DON'T wait - return immediately and let React suspend if chunk 0 isn't ready
  // Return a component FUNCTION (not element!) that uses lazy evaluation
  // React calls readChunk() during render, enabling progressive Suspense
  return Promise.resolve(function RSCTreeRoot() {
    // Chunk 0 might be PENDING, RESOLVED_MODEL or INITIALIZED; getChunk
    // creates a PENDING one if it has not arrived, which readChunk throws
    // for Suspense, or an ERRORED one once the stream is closed.
    return unwrapRootValue(readChunk(getChunk(0, context)));
  });
}

/** Whether a value thrown by readChunk is a chunk to wait for. */
function isPendingChunk(thrown: unknown): thrown is PendingChunk {
  return (
    typeof thrown === "object" &&
    thrown !== null &&
    "_status" in thrown &&
    thrown._status === PENDING
  );
}

/** Wait until a PENDING chunk arrives; rejects when it fails instead. */
function waitForChunk(chunk: PendingChunk): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chunk.then(() => resolve(), reject);
  });
}

/**
 * Decode the value in chunk 0 of an RSC stream, such as a server action's
 * result.
 *
 * createFromReadableStream returns a component for React to render; this
 * resolves with the value itself once chunk 0 and the chunks it references
 * have arrived. Dates, Maps, Sets, BigInts, `undefined` and React elements
 * come back as themselves, and the content of a Suspense boundary inside an
 * element keeps streaming after the promise resolves.
 *
 * @param stream RSC wire format stream from server
 * @param moduleLoader Loads the client components the value references
 * @returns Promise resolving to the decoded value; it rejects with the
 *   message of an error chunk, or with the stream's error when the stream
 *   fails before the value is complete
 */
export async function createValueFromReadableStream(
  stream: ReadableStream<Uint8Array>,
  moduleLoader: ModuleLoader = defaultModuleLoader,
): Promise<unknown> {
  const context = createClientContext(moduleLoader, false);

  // Process the stream in the background, also after the value resolves.
  // consumeRSCStream handles every failure itself, so this never rejects.
  const _streamComplete = consumeRSCStream(stream, context, "for a value");

  while (true) {
    try {
      return readChunk(getChunk(0, context));
    } catch (thrown) {
      if (!isPendingChunk(thrown)) {
        throw thrown;
      }

      // Each round waits for the next missing chunk. It arrives, or the
      // stream closes and fails it, so the loop always ends.
      // oxlint-disable-next-line no-await-in-loop
      await waitForChunk(thrown);
    }
  }
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
  // The payload is already complete
  const context = createClientContext(moduleLoader, true);

  // Process all chunks - await each one since processChunk is async (for module loading)
  for (const chunk of payload) {
    // Chunks apply in payload order: a repeated chunk id sees the state the
    // earlier one left.
    // oxlint-disable-next-line no-await-in-loop
    await processChunk(chunk, context);
  }

  // Return a component FUNCTION (not element!) that uses lazy evaluation
  // This is the same pattern as createFromReadableStream
  // Since this is an async function, we return the function directly (no need for Promise.resolve)
  return function RSCTreeRootFromPayload() {
    // Get chunk 0 - should be RESOLVED_MODEL or INITIALIZED
    const rootChunk = context.chunks.get(0);

    if (!rootChunk) {
      throw new Error("Root chunk (ID 0) not found in RSC payload");
    }

    // Read chunk - will initialize if RESOLVED_MODEL
    return unwrapRootValue(readChunk(rootChunk));
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
  // The payload is already complete
  const context = createClientContext(moduleLoader, true);

  // Process all chunks - we need them all for reference resolution
  for (const chunk of payload) {
    // Chunks apply in payload order: a repeated chunk id sees the state the
    // earlier one left.
    // oxlint-disable-next-line no-await-in-loop
    await processChunk(chunk, context);
  }

  // Get the specified chunk
  const targetChunk = context.chunks.get(chunkId);
  if (!targetChunk) {
    throw new Error(`Chunk ${chunkId} not found in RSC payload`);
  }

  // Read the chunk - this will parse and resolve all references
  return readChunk(targetChunk);
}

/**
 * Check if the page has embedded RSC payload for hydration
 * @returns True if RSC payload script tag exists
 */
export function hasEmbeddedPayload(): boolean {
  if (typeof globalThis.document === "undefined") return false;
  return globalThis.document.getElementById("__RSC_PAYLOAD__") !== null;
}

/**
 * Get embedded RSC payload from the HTML document
 * @returns Parsed RSC chunks or null if not found
 */
export function getEmbeddedPayload(): RSCChunk[] | null {
  if (typeof globalThis.document === "undefined") return null;

  const payloadElement = globalThis.document.getElementById("__RSC_PAYLOAD__");
  if (!payloadElement) return null;

  try {
    const payloadText = payloadElement.textContent;
    if (!payloadText) return null;

    return JSON.parse(payloadText) as RSCChunk[];
  } catch (error) {
    // Handled here: callers treat a payload they cannot read as missing.
    getClientLogger()
      .with({ error })
      .error(
        "parse the embedded RSC payload in #__RSC_PAYLOAD__; continuing without it",
      );
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
  if (typeof globalThis.document === "undefined") return false;
  return (
    globalThis.document.getElementById("__RSC_INLINE_BOOTSTRAP__") !== null
  );
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
  const context = createClientContext(moduleLoader, false);

  // Process buffered chunks first
  const bufferedChunks = getStreamingOptimalBuffer();

  for (const chunk of bufferedChunks) {
    // Buffered chunks apply in arrival order, as they would from a stream.
    // oxlint-disable-next-line no-await-in-loop
    await processChunk(chunk, context);
  }

  // Set up handler for future chunks (replacing the buffer)
  // Type assertion needed: setting RSC streaming runtime globals for inline script chunks
  (globalThis as any).__RSC_CHUNK__ = async (chunk: RSCChunk) => {
    await processChunk(chunk, context);
  };

  // Mark context as closed when streaming completes
  const checkComplete = () => {
    if (isStreamingOptimalComplete()) {
      context._closed = true;
    } else {
      // Check again in the next frame
      globalThis.requestAnimationFrame(checkComplete);
    }
  };
  checkComplete();

  // Return a component FUNCTION that uses lazy evaluation
  return function RSCTreeRootFromStreamingOptimal() {
    // Chunk 0 might not be received yet: getChunk then creates a PENDING
    // chunk, which readChunk throws for Suspense.
    return unwrapRootValue(readChunk(getChunk(0, context)));
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
 * @param _inlinePayload Pre-parsed RSC chunks from embedded script tag; not
 *   read yet, see the note in the body
 * @param rscFetchPromise Promise for the /rsc fetch (provides async chunks)
 * @param moduleLoader Optional custom module loader
 * @returns Promise resolving to a React component function
 */
export function createHybridRSCTree(
  _inlinePayload: RSCChunk[] | null,
  rscFetchPromise: Promise<Response>,
  moduleLoader: ModuleLoader = defaultModuleLoader,
): Promise<any> {
  const context = createClientContext(moduleLoader, false);

  // 1. Skip inline chunks entirely for now
  // The inline (SSR) and /rsc chunk ID schemes are incompatible:
  // - Same chunk ID has different content in each (e.g., element vs props)
  // - This causes React error #31 and other issues
  // Until SSR generates compatible chunks, we rely solely on /rsc.

  // Create PENDING for root chunk - /rsc will provide the real data
  const rootPending = createPendingChunk(context);
  context.chunks.set(0, rootPending);

  // 2. Start processing /rsc stream in background (async components)
  // This runs concurrently - React will render sync content immediately
  // and update async content as chunks arrive from /rsc. Every failure is
  // handled inside, so this promise never rejects.
  const _streamComplete = (async () => {
    let body: ReadableStream<Uint8Array>;
    try {
      const response = await rscFetchPromise;
      if (!response.ok) {
        throw new Error(
          `fetch /rsc: the server answered ${response.status} ${response.statusText}; check the server log`,
        );
      }
      if (response.body === null) {
        throw new Error("fetch /rsc: the response has no body");
      }
      body = response.body;
    } catch (error) {
      // Handled here, like a failed stream: the pending root chunk fails
      // with the error, and the error boundary around the tree shows it.
      closeContext(context, toError(error));
      await getClientLogger()
        .with({
          error,
        })
        .error("fetch the RSC stream from /rsc");
      return;
    }

    // Chunks that already exist get updated, and new ones wake the
    // listeners that wait for them.
    await consumeRSCStream(body, context, "from /rsc");
  })();

  // 3. Return Promise that resolves to a component that reads from unified context
  // React will render what's available immediately (sync from inline)
  // and suspend on PENDING chunks (async from /rsc)
  // Wrapped in Promise.resolve to match the Promise<any> return type for use() hook
  return Promise.resolve(function RSCTreeRootHybrid() {
    // Read chunk - will throw if PENDING (async not yet resolved)
    return unwrapRootValue(readChunk(getChunk(0, context)));
  });
}
