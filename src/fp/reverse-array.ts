function reverseArray<T>(instance: Iterable<T>): Array<T> {
	const arrInstance = (instance.constructor === Array)
		? <Array<T>> instance
		: [...instance];

	return arrInstance.reduce(
		(obj: Array<T>, itemValue: T) => [itemValue, ...obj],
		[],
	);
}

export { reverseArray, reverseArray as default };
