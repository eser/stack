// deno-lint-ignore no-explicit-any
type EventType = (...args: Array<any>) => void | Promise<void>;
type LogType = {
  event: string;
  subscriber: string;
  args: Array<unknown> | undefined;
};
type LoggerType = (entry: LogType) => void;

async function emitter(
  events: Record<string, Array<EventType>>,
  eventName: string,
  args?: Array<unknown>,
  loggers?: Array<LoggerType>,
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
}

export { emitter as default };
export type { EventType, LoggerType, LogType };
