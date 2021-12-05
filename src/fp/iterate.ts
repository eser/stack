async function iterate(
	// deno-lint-ignore no-explicit-any
	iterable: Iterable<any> | Promise<Iterable<any>>,
	// deno-lint-ignore no-explicit-any
	func: (...args: Array<any>) => Promise<any> | any,
): Promise<void> {
	for (const value of await iterable) {
		await func(value);
	}
}

export { iterate, iterate as default };
