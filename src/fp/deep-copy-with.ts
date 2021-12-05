import deepCopy from "./deep-copy.ts";

const deepCopyWith = function deepCopyWith<T extends unknown>(
	source: T,
	modificationFn: (value: T) => void,
): T {
	const instance = deepCopy(source);

	modificationFn(instance);

	return instance;
};

export { deepCopyWith, deepCopyWith as default };
