// deno-lint-ignore no-explicit-any
type ComposableFunction = (...args: any[]) => any;

const compose = function compose(
  ...funcs: ComposableFunction[]
): ComposableFunction {
  return funcs.reduce(
    (previousFunction, currentFunction) =>
      (...args) => previousFunction(currentFunction(...args)),
  );
};

export { compose, compose as default };
