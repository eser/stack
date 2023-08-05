export type NextType<T> = (newState: T) => Promise<T>;
export type MutatorType<T> = (state: T, next: NextType<T>) => Promise<T>;
export type LogType<T> = { action: string; previousState: T; newState: T };
export type LoggerType<T> = (entry: LogType<T>) => void;

export const dispatcher = <T>(
  state: T,
  mutators: readonly MutatorType<T>[],
  loggers?: readonly LoggerType<T>[],
): Promise<T> => {
  let index = 0;

  const next = async (newState: T): Promise<T> => {
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
  };

  return next(state);
};

export { dispatcher as default };
