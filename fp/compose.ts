import {
  type AnonymousFunction,
  type ArgList,
} from "../standards/functions.ts";

type ComposableFunction = AnonymousFunction;

export const compose = (
  ...funcs: ReadonlyArray<ComposableFunction>
): ComposableFunction => {
  return funcs.reduce(
    (previousFunction, currentFunction) => (...args: ArgList) =>
      previousFunction(currentFunction(...args)),
  );
};

export { compose as default };
