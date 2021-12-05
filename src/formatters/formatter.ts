interface Formatter {
	names: string[];
	serialize: <T>(payload: T | Promise<T>) => Promise<unknown>;
	deserialize: <T>(payload: unknown | Promise<unknown>) => Promise<T>;
}

export type { Formatter, Formatter as default };
