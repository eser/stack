function mapObject<T1, T2>(
	instance: Record<string | symbol, T1>,
	predicate: (
		value: T1,
		key: string | symbol,
		instance: Record<string | symbol, T1>,
	) => Record<string | symbol, T2> | null,
): Record<string | symbol, T2> {
	return Object.keys(instance).reduce(
		(obj, itemKey) => {
			const value = predicate(instance[itemKey], itemKey, obj);

			if (value !== null) {
				return Object.assign({}, obj, value);
			}

			return obj;
		},
		{},
	);
}

export { mapObject, mapObject as default };
