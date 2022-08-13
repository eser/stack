// deno-lint-ignore no-explicit-any
type ComposableFunction = (...args: readonly any[]) => any;

const compose = function compose(
  ...funcs: readonly ComposableFunction[]
): ComposableFunction {
  return funcs.reduce(
    (previousFunction, currentFunction) => (...args) =>
      previousFunction(currentFunction(...args)),
  );
};

export { compose, compose as default };
