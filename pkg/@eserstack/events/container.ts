// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as primitives from "./primitives.ts";

/** The state of a `Registry`: the `EventTarget` its listeners are added to. */
export type RegistryState = primitives.EventRegistryState;

/**
 * Creates the state of a registry.
 *
 * @param target - The target to add listeners to; a new `EventTarget` when
 *   absent
 * @returns The registry state
 */
export const createRegistryState = (target?: EventTarget): RegistryState => {
  return {
    target: target ?? new EventTarget(),
  };
};

/**
 * Holds event listeners on one `EventTarget`. `add` and `remove` return the
 * registry, so calls chain, and `build` creates a dispatcher for it.
 *
 * @example
 * ```typescript
 * import * as events from "@eserstack/events";
 *
 * const received: unknown[] = [];
 * const registry = new events.Registry()
 *   .add("order:placed", (e) => received.push((e as CustomEvent).detail));
 *
 * registry.build().dispatch("order:placed", { detail: { orderId: 42 } });
 * // received = [{ orderId: 42 }]
 * ```
 */
export class Registry implements primitives.EventRegistry {
  /** The target that holds this registry's listeners. */
  readonly state: RegistryState;

  /**
   * Creates a registry.
   *
   * @param state - The registry state; one with a new `EventTarget` when
   *   absent
   */
  constructor(state?: RegistryState) {
    this.state = state ?? createRegistryState();
  }

  /**
   * Adds a listener for events of `type`.
   *
   * @param type - The event type
   * @param listener - Called with each event of `type`
   * @param options - The options of `EventTarget.addEventListener`, such as
   *   `{ once: true }`
   * @returns This registry
   */
  add(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): this {
    this.state.target.addEventListener(type, listener, options);

    return this;
  }

  /**
   * Removes a listener added with the same `type`, listener and options.
   *
   * @param type - The event type
   * @param listener - The listener to remove
   * @param options - The options of `EventTarget.removeEventListener`
   * @returns This registry
   */
  remove(
    type: string,
    listener: EventListener,
    options?: EventListenerOptions,
  ): this {
    this.state.target.removeEventListener(type, listener, options);

    return this;
  }

  /**
   * Creates a dispatcher that dispatches events to this registry's target.
   *
   * @returns The dispatcher
   */
  build(): primitives.EventDispatcher {
    return new Dispatcher(createDispatcherState(this));
  }
}

/** The state of a `Dispatcher`: the registry whose target it dispatches to. */
export type DispatcherState = primitives.EventDispatcherState;

/**
 * Creates the state of a dispatcher.
 *
 * @param registry - The registry whose target receives the events
 * @returns The dispatcher state
 */
export const createDispatcherState = (
  registry: primitives.EventRegistry,
): DispatcherState => {
  return {
    registry,
  };
};

/** Dispatches `CustomEvent`s to the target of a registry. */
export class Dispatcher implements primitives.EventDispatcher {
  /** The registry this dispatcher dispatches to. */
  readonly state: DispatcherState;

  /**
   * Creates a dispatcher. `Registry.build()` calls this for you.
   *
   * @param state - The dispatcher state
   */
  constructor(state: DispatcherState) {
    this.state = state;
  }

  /**
   * Dispatches a `CustomEvent` of `type` to the registry's target.
   *
   * @param type - The event type
   * @param eventInitDict - The event options; `detail` is the payload
   * @returns `false` when the event is cancelable and a listener called
   *   `preventDefault()`, otherwise `true`
   */
  dispatch<T>(type: string, eventInitDict?: CustomEventInit<T>): boolean {
    return this.state.registry.state.target.dispatchEvent(
      new CustomEvent<T>(type, eventInitDict),
    );
  }
}
