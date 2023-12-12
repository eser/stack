// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

export interface EventRegistry {
  target: EventTarget;

  add(
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): void;
  remove(
    type: string,
    listener: EventListener,
    options?: EventListenerOptions,
  ): void;

  build(): EventDispatcher;
}

export interface EventDispatcher {
  registry: EventRegistry;

  dispatch<T>(type: string, eventInitDict?: CustomEventInit<T>): boolean;
}
