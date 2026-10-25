// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** A subscriber to an event. It may return a promise, which is awaited. */
export type EventType = (
  // oxlint-disable-next-line typescript/no-explicit-any
  ...args: ReadonlyArray<any>
) => Promise<void> | void;

/** One subscriber call, as passed to each logger. */
export type LogType = {
  event: string;
  subscriber: string;
  args: ReadonlyArray<unknown> | undefined;
};

/** Receives each subscriber call of an `emitter` run. */
export type LoggerType = (entry: LogType) => void;

/**
 * Calls the subscribers of an event one at a time, in registration order,
 * waiting for each. The event name `"*"` calls the subscribers of every event.
 * Each call is reported to the loggers before it runs.
 *
 * @param events - Subscribers by event name
 * @param eventName - The event to emit, or `"*"` for all
 * @param args - Arguments passed to each subscriber
 * @param loggers - Called with each subscriber call
 * @returns A promise that resolves when every subscriber has finished
 */
export const emitter = async (
  events: Record<string, Array<EventType>>,
  eventName: string,
  args?: ReadonlyArray<unknown>,
  loggers?: ReadonlyArray<LoggerType>,
): Promise<void> => {
  const isEventWildcard = eventName === "*";
  const argsPass = args !== undefined ? args : [];

  for (const [eventKey, value] of Object.entries(events)) {
    if (!isEventWildcard && eventName !== eventKey) {
      continue;
    }

    for (const eventSubscriber of value) {
      loggers?.forEach((logger: LoggerType) => {
        logger({
          event: eventKey,
          subscriber: eventSubscriber.name,
          args: args,
        });
      });

      // Subscribers run one at a time in registration order, so a subscriber
      // sees the effects of the ones before it.
      // oxlint-disable-next-line no-await-in-loop
      await eventSubscriber(...argsPass);
    }
  }
};
