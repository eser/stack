import type Event from "./event.ts";
import type EventType from "./event-type.ts";
import type PlatformContext from "./platform-context.ts";

// input: <T>(
//   payload: T,
//   options?: InputOptions,
// ) => Promise<void>;
// output: <T>(
//   payload: T,
//   options?: OutputOptions,
// ) => Promise<void>;
// kill: () => Promise<void>;

// interface InputOptions {
//   formatterObject?: Formatter;
//   formatter?: string;
// }

// interface OutputOptions {
//   formatterObject?: Formatter;
//   formatter?: string;
//   isError?: boolean;
// }

function dispatch(
	context: PlatformContext,
	type: EventType,
	...args: unknown[]
): void {
	const event: Event = {
		platformContext: context,
		type: type,
		// vars:
	};
}

export { dispatch as default };
