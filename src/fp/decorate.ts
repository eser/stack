type Decorated<T1, T2> = (...args: Array<T1>) => T2;

const decorate = function decorate<T1, T2>(
	target: Decorated<T1, T2>,
	decorator: (...args: [Decorated<T1, T2>, ...Array<T1>]) => T2,
) {
	return function func(...args: Array<T1>): T2 {
		return decorator(target, ...args);
	};
};

export { decorate, decorate as default };
