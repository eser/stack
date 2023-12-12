// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import { type EventDispatcher } from "./primitives.ts";

export const factory = (dispatcher: EventDispatcher) => {
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
  ) => dispatcher.registry.add(type, listener, options);

  events.remove = (
    type: string,
    listener: EventListener,
    options?: EventListenerOptions,
  ) => dispatcher.registry.remove(type, listener, options);

  return events;
};
