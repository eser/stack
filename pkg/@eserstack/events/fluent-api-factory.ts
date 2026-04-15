// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type EventDispatcher, type Factory } from "./primitives.ts";

export const factory = (dispatcher: EventDispatcher): Factory => {
  const events = (strings?: TemplateStringsArray) => {
    if (strings === undefined) {
      return dispatcher;
    }

    return <T>(eventInitDict?: CustomEventInit<T>) =>
      dispatcher.dispatch<T>(strings[0]!, eventInitDict);
  };

  events.add = (
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) => dispatcher.state.registry.add(type, listener, options);

  events.remove = (
    type: string,
    listener: EventListener,
    options?: EventListenerOptions,
  ) => dispatcher.state.registry.remove(type, listener, options);

  return events;
};
