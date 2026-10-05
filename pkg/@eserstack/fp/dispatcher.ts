// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** Passes the state on to the next mutator and resolves to the final state. */
export type NextType<T> = (newState: T) => Promise<T>;
/**
 * One step of a `dispatcher` run. It receives the state and `next`, and
 * resolves to the state it returns, usually what `next` resolved to.
 */
export type MutatorType<T> = (state: T, next: NextType<T>) => Promise<T>;
/** A state change one mutator made, as passed to each logger. */
export type LogType<T> = { action: string; previousState: T; newState: T };
/** Receives each state change of a `dispatcher` run. */
export type LoggerType<T> = (entry: LogType<T>) => void;

/**
 * Runs mutators in order over a state, like middleware. Each mutator calls
 * `next` with a new state to run the mutators after it, and every call to
 * `next` is reported to the loggers with the mutator's function name.
 *
 * @param state - The initial state
 * @param mutators - The mutators, in order
 * @param loggers - Called with each state change
 * @returns The state the first mutator resolves to
 */
export const dispatcher = <T>(
  state: T,
  mutators: ReadonlyArray<MutatorType<T>>,
  loggers?: ReadonlyArray<LoggerType<T>>,
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
