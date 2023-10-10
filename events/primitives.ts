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
