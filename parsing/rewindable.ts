// deno-lint-ignore-file no-explicit-any
export type RewindableIterator<T, TReturn = any, TNext = undefined> =
  & Iterable<T>
  & Iterator<T, TReturn, TNext>
  & {
    rewind: () => void;
    sweep: () => void;
  };

// deno-lint-ignore-file no-explicit-any
export const rewindable = <T, TReturn = any, TNext = undefined>(
  iterator: Iterator<T, TReturn, TNext>,
) => {
  let buffer: IteratorResult<T, TReturn>[] = [];
  let stash: IteratorResult<T, TReturn>[] = [];
  let done = false;

  const rewindableGenerator: RewindableIterator<T, TReturn | undefined, TNext> =
    {
      next: (
        ..._args: [] | [TNext]
      ): IteratorResult<T, TReturn | undefined> => {
        if (done) {
          return { value: undefined, done: true };
        }

        if (buffer.length > 0) {
          const shiftedValue = buffer.shift();

          if (shiftedValue !== undefined) {
            return shiftedValue;
          }
        }

        const next = iterator.next();
        stash.push(next);

        if (next.done) {
          done = true;
        }

        return next;
      },
      rewind: () => {
        if (stash.length === 0) {
          return;
        }

        done = false;
        buffer = [...stash];
        stash = [];
      },
      sweep: () => {
        stash = [];
      },
      [Symbol.iterator]: function* () {
        let result = this.next();

        while (!result.done) {
          yield result.value;
          result = this.next();
        }
      },
    };

  return rewindableGenerator;
};
