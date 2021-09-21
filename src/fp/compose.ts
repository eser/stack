// deno-lint-ignore no-explicit-any
type ComposableFunction = (...args: Array<any>) => any;

function compose(...funcs: Array<ComposableFunction>): ComposableFunction {
  return funcs.reduce(
    (
      previousFunction: ComposableFunction,
      currentFunction: ComposableFunction,
    ) =>
      // deno-lint-ignore no-explicit-any
      (...args: Array<any>): any =>
        currentFunction(previousFunction(...args)),
  );
}

export { compose as default };
