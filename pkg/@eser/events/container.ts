// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as primitives from "./primitives.ts";

export type RegistryState = primitives.EventRegistryState;

export const createRegistryState = (target?: EventTarget): RegistryState => {
  return {
    target: target ?? new EventTarget(),
  };
};

export class Registry implements primitives.EventRegistry {
  readonly state: RegistryState;

  constructor(state?: RegistryState) {
    this.state = state ?? createRegistryState();
  }

  add(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): this {
    this.state.target.addEventListener(type, listener, options);

    return this;
  }

  remove(
    type: string,
    listener: EventListener,
    options?: EventListenerOptions,
  ): this {
    this.state.target.removeEventListener(type, listener, options);

    return this;
  }

  build(): primitives.EventDispatcher {
    return new Dispatcher(createDispatcherState(this));
  }
}

export type DispatcherState = primitives.EventDispatcherState;

export const createDispatcherState = (
  registry: primitives.EventRegistry,
): DispatcherState => {
  return {
    registry,
  };
};

export class Dispatcher implements primitives.EventDispatcher {
  readonly state: DispatcherState;

  constructor(state: DispatcherState) {
    this.state = state;
  }

  dispatch<T>(type: string, eventInitDict?: CustomEventInit<T>): boolean {
    return this.state.registry.state.target.dispatchEvent(
      new CustomEvent<T>(type, eventInitDict),
    );
  }
}
