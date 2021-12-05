// deno-lint-ignore no-explicit-any
type ComposableFunction = (...args: Array<any>) => any;

const compose = function compose(
	...funcs: Array<ComposableFunction>
): ComposableFunction {
	return funcs.reduce(
		(previousFunction, currentFunction) =>
			(...args) => previousFunction(currentFunction(...args)),
	);
};

export { compose, compose as default };
