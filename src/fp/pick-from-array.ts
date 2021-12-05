type PickFromArrayResult<T> = { items: Array<T>; rest: Array<T> };

const pickFromArray = function pickFromArray<T>(
	instance: Iterable<T>,
	items: Iterable<T>,
): PickFromArrayResult<T> {
	const arrInstance = (instance.constructor === Array)
		? <Array<T>> instance
		: [...instance];

	const arrItems = (items.constructor === Array)
		? <Array<T>> items
		: [...items];

	return arrInstance.reduce(
		(obj: PickFromArrayResult<T>, itemValue: T) => {
			if (arrItems.indexOf(itemValue) !== -1) {
				return {
					items: [...obj.items, itemValue],
					rest: obj.rest,
				};
			}

			return {
				items: obj.items,
				rest: [...obj.rest, itemValue],
			};
		},
		{
			items: [],
			rest: [],
		},
	);
};

export { pickFromArray, pickFromArray as default };
