function removeIndexFromArray<T>(
	instance: Iterable<T>,
	...indexes: Array<number>
): Array<T> {
	const arrInstance = (instance.constructor === Array)
		? <Array<T>> instance
		: [...instance];

	return arrInstance.filter(
		(_, index) => indexes.indexOf(index) === -1,
	);
}

export { removeIndexFromArray, removeIndexFromArray as default };
