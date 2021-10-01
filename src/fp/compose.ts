// deno-lint-ignore no-explicit-any
type ComposableFunction = (...args: Array<any>) => any;

function compose(...funcs: Array<ComposableFunction>): ComposableFunction {
  return funcs.reduce(
    (previousFunction, currentFunction) =>
      (...args) => currentFunction(previousFunction(...args)),
  );
}

export { compose as default };
