import type Formatter from "../formatter/formatter.ts";

function pickBestFormatter(formatters: Formatter[]): Formatter | null {
	if (formatters.length === 0) {
		return null;
	}

	return formatters[0];
}

function pickSpecifiedFormatter(
	formatters: Formatter[],
	choice: string,
): Formatter | null {
	const filteredFormatters = formatters.filter((formatter) =>
		formatter.names.includes(choice)
	);

	const bestFormatter = pickBestFormatter(filteredFormatters);

	if (bestFormatter === null) {
		throw new Error(`formatter is unavailable - ${choice}`);
	}

	return bestFormatter;
}

function pickFormatter(
	formatters: Formatter[],
	options?: {
		formatterObject?: Formatter;
		formatter?: string;
	},
): Formatter | null {
	// if formatter is directly specified, go with it.
	const formatterObject = options?.formatterObject;

	if (formatterObject !== null && formatterObject !== undefined) {
		return formatterObject;
	}

	// if a choice is specified, try to pick it.
	const choice = options?.formatter;

	if (choice !== null && choice !== undefined) {
		return pickSpecifiedFormatter(formatters, choice);
	}

	// otherwise, formatting is unnecessary
	return null;
}

export { pickFormatter as default };
