// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export interface EventRegistryWritable {
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
}

export type EventRegistry = EventRegistryWritable & {
  target: EventTarget;

  build(): EventDispatcher;
};

export type EventDispatcher = {
  registry: EventRegistry;

  dispatch<T>(type: string, eventInitDict?: CustomEventInit<T>): boolean;
};

export type Factory =
  & EventRegistryWritable
  & {
    (
      strings?: TemplateStringsArray,
    ): EventDispatcher | (<T>(eventInitDict?: CustomEventInit<T>) => boolean);
  };
