import Event from "./event.ts";
import type Formatter from "../formatters/formatter.ts";
import PlatformType from "./platform-type.ts";

// requirements:
// a. each platform context (pc) has environment variables.
// b. each pc has own event handling mechanism.
// c. each pc decides valid formatters.

interface PlatformContext {
	type: PlatformType;

	getAvailableFormatters: () => Formatter[];
	getAllVariables: () => Record<string, unknown | null>;
	getVariable: (name: string) => unknown | null | undefined;

	eventHandler:
		| ((event: Event, ...args: unknown[]) => void | Promise<void>)
		| null;

	vars: Record<string, () => unknown | unknown>;
}

export type { PlatformContext as default };
