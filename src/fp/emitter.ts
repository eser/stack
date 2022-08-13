// deno-lint-ignore no-explicit-any
type EventType = (...args: readonly any[]) => void | Promise<void>;
type LogType = {
  event: string;
  subscriber: string;
  args: readonly unknown[] | undefined;
};
type LoggerType = (entry: LogType) => void;

const emitter = async function emitter(
  events: Record<string, EventType[]>,
  eventName: string,
  args?: readonly unknown[],
  loggers?: readonly LoggerType[],
): Promise<void> {
  const isEventWildcard = (eventName === "*");
  const argsPass = (args !== undefined) ? args : [];

  for (const eventKey of Object.keys(events)) {
    if (!isEventWildcard && eventName !== eventKey) {
      continue;
    }

    for (const eventSubscriber of events[eventKey]) {
      loggers?.forEach((logger: LoggerType) => {
        logger(
          { event: eventKey, subscriber: eventSubscriber.name, args: args },
        );
      });

      await eventSubscriber(...argsPass);
    }
  }
};

export {
  emitter,
  emitter as default,
  type EventType,
  type LoggerType,
  type LogType,
};
