function appendToObject<T>(
	instance: Record<string | symbol, T>,
	...values: Array<Record<string | symbol, T>>
): Record<string | symbol, T> {
	return Object.assign({}, instance, ...values);
}

export { appendToObject, appendToObject as default };
