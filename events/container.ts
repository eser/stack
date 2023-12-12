// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import { type EventDispatcher, type EventRegistry } from "./primitives.ts";

export class Registry implements EventRegistry {
  target = new EventTarget();

  add(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) {
    this.target.addEventListener(type, listener, options);

    return this;
  }

  remove(
    type: string,
    listener: EventListener,
    options?: EventListenerOptions,
  ) {
    this.target.removeEventListener(type, listener, options);

    return this;
  }

  build(): EventDispatcher {
    return new Dispatcher(this);
  }
}

export class Dispatcher implements EventDispatcher {
  registry;

  constructor(registry: EventRegistry) {
    this.registry = registry;
  }

  dispatch<T>(type: string, eventInitDict?: CustomEventInit<T>) {
    return this.registry.target.dispatchEvent(
      new CustomEvent<T>(type, eventInitDict),
    );
  }
}
