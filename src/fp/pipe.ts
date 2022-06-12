// deno-lint-ignore no-explicit-any
type ComposableFunction = (...args: readonly any[]) => any;

const pipe = function pipe(
  ...funcs: readonly ComposableFunction[]
): ComposableFunction {
  return funcs.reduce(
    (previousFunction, currentFunction) =>
      (...args) => currentFunction(previousFunction(...args)),
  );
};

export { pipe, pipe as default };
