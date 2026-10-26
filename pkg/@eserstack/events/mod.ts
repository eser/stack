// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Event registries and dispatchers built on `EventTarget`. A `Registry` holds
 * listeners, `build()` returns a dispatcher that sends `CustomEvent`s to them,
 * and `registry`, `dispatcher` and `events` are a process-wide instance.
 *
 * @example
 * ```typescript
 * import * as events from "@eserstack/events";
 *
 * const registry = new events.Registry();
 * registry.add("user:login", (e) => {
 *   const { userId } = (e as CustomEvent<{ userId: number }>).detail;
 * });
 *
 * registry.build().dispatch("user:login", { detail: { userId: 123 } });
 * ```
 *
 * @module
 */

export {
  type EventDispatcher,
  type EventDispatcherState,
  type EventRegistry,
  type EventRegistryState,
  type EventRegistryWritable,
  type Factory,
} from "./primitives.ts";
export {
  createDispatcherState,
  createRegistryState,
  Dispatcher,
  type DispatcherState,
  Registry,
  type RegistryState,
} from "./container.ts";
export { dispatcher, events, registry } from "./events.ts";
