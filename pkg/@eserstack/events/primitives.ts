// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** Adds and removes event listeners. */
export interface EventRegistryWritable {
  /**
   * Adds a listener for events of `type`, with the options of
   * `EventTarget.addEventListener` (for example `{ once: true }`).
   */
  add(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): void;
  /** Removes a listener added with the same `type`, listener and options. */
  remove(
    type: string,
    listener: EventListener,
    options?: EventListenerOptions,
  ): void;
}

/** The state of a registry: the `EventTarget` its listeners are added to. */
export type EventRegistryState = {
  /** The target that holds the listeners and receives dispatched events. */
  readonly target: EventTarget;
};

/** A set of listeners on one `EventTarget` that can build a dispatcher. */
export type EventRegistry = EventRegistryWritable & {
  /** The registry's target. */
  readonly state: EventRegistryState;

  /** Creates a dispatcher that dispatches events to this registry's target. */
  build(): EventDispatcher;
};

/** The state of a dispatcher: the registry whose target it dispatches to. */
export type EventDispatcherState = {
  /** The registry whose target receives the events. */
  readonly registry: EventRegistry;
};

/** Dispatches `CustomEvent`s to the listeners of a registry. */
export type EventDispatcher = {
  /** The registry this dispatcher dispatches to. */
  readonly state: EventDispatcherState;

  /**
   * Dispatches a `CustomEvent` of `type`, with `eventInitDict.detail` as its
   * payload.
   *
   * @returns `false` when the event is cancelable and a listener called
   *   `preventDefault()`, otherwise `true`
   */
  dispatch<T>(type: string, eventInitDict?: CustomEventInit<T>): boolean;
};

/**
 * The `events` function: called with no arguments it returns the dispatcher;
 * used as a tag (``events`user:login` ``) it returns a function that
 * dispatches that event type. It also has `add` and `remove` for listeners.
 */
export type Factory =
  & EventRegistryWritable
  & {
    (
      strings?: TemplateStringsArray,
    ): EventDispatcher | (<T>(eventInitDict?: CustomEventInit<T>) => boolean);
  };
