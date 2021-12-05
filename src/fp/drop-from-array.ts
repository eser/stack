function dropFromArray<T>(instance: Iterable<T>, n: number): Array<T> {
	const arrInstance = (instance.constructor === Array)
		? <Array<T>> instance
		: [...instance];

	return arrInstance.slice(n);
}

export { dropFromArray, dropFromArray as default };
