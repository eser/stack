import { type Promisable } from "../standards/promises.ts";

export type NextFn = () => Promisable<void>;

export type MiddlewareFn<T> = (context: T, next: NextFn) => Promisable<void>;

export type Pipeline<T> = {
  push: (...middlewares: MiddlewareFn<T>[]) => void;
  execute: (context: T) => Promise<void>;
};

export const pipeline = <T>(...middlewares: MiddlewareFn<T>[]): Pipeline<T> => {
  const stack: MiddlewareFn<T>[] = middlewares;

  const push: Pipeline<T>["push"] = (...middlewares) => {
    stack.push(...middlewares);
  };

  const execute: Pipeline<T>["execute"] = async (context) => {
    let prevIndex = -1;

    const runner = async (index: number): Promise<void> => {
      if (index === prevIndex) {
        throw new Error("next() called multiple times");
      }

      prevIndex = index;

      const middleware = stack[index];

      if (middleware !== undefined) {
        await middleware(context, () => {
          return runner(index + 1);
        });
      }
    };

    await runner(0);
  };

  return { push, execute };
};
