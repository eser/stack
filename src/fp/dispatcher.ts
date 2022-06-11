type NextType<T> = (newState: T) => Promise<T>;
type MutatorType<T> = (state: T, next: NextType<T>) => Promise<T>;
type LogType<T> = { action: string; previousState: T; newState: T };
type LoggerType<T> = (entry: LogType<T>) => void;

const dispatcher = function dispatcher<T>(
  state: T,
  mutators: Array<MutatorType<T>>,
  loggers?: Array<LoggerType<T>>,
): Promise<T> {
  let index = 0;

  async function next(newState: T): Promise<T> {
    const layer = mutators[index];

    if (layer === undefined) {
      return Promise.resolve(newState);
    }

    index += 1;

    return await layer(
      newState,
      (currentState: T) => {
        loggers?.forEach((logger: LoggerType<T>) => {
          logger(
            {
              action: layer.name,
              previousState: newState,
              newState: currentState,
            },
          );
        });

        return next(currentState);
      },
    );
  }

  return next(state);
};

export { dispatcher, dispatcher as default };
export type { LoggerType, LogType, MutatorType, NextType };
