// deno-lint-ignore no-explicit-any
type ComposableFunction = (...args: readonly any[]) => any;

export const compose = (
  ...funcs: readonly ComposableFunction[]
): ComposableFunction => {
  return funcs.reduce(
    (previousFunction, currentFunction) => (...args) =>
      previousFunction(currentFunction(...args)),
  );
};

export { compose as default };
