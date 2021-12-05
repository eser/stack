function prependToObject<T>(
	instance: Record<string | symbol, T>,
	...values: Array<Record<string | symbol, T>>
): Record<string | symbol, T> {
	return Object.assign({}, ...values, instance);
}

export { prependToObject, prependToObject as default };
