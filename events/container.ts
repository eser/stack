// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type EventDispatcher, type EventRegistry } from "./primitives.ts";

export class Registry implements EventRegistry {
  target: EventTarget = new EventTarget();

  add(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): this {
    this.target.addEventListener(type, listener, options);

    return this;
  }

  remove(
    type: string,
    listener: EventListener,
    options?: EventListenerOptions,
  ): this {
    this.target.removeEventListener(type, listener, options);

    return this;
  }

  build(): EventDispatcher {
    return new Dispatcher(this);
  }
}

export class Dispatcher implements EventDispatcher {
  registry: EventRegistry;

  constructor(registry: EventRegistry) {
    this.registry = registry;
  }

  dispatch<T>(type: string, eventInitDict?: CustomEventInit<T>): boolean {
    return this.registry.target.dispatchEvent(
      new CustomEvent<T>(type, eventInitDict),
    );
  }
}
