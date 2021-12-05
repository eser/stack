import type Event from "../event.ts";
import type EventType from "../event-type.ts";
import type Formatter from "../../formatter/formatter.ts";
import type PlatformContext from "../platform-context.ts";
import PlatformType from "../platform-type.ts";
// import type InputOptions from "../input-options.ts";
// import type OutputOptions from "../output-options.ts";
import textPlainFormatter from "../../formatters/text-plain.ts";
import applicationJsonFormatter from "../../formatters/application-json.ts";
import pickFormatter from "../pick-formatter.ts";

function getType(): PlatformType {
	return PlatformType.Stateless;
}

function getAvailableFormatters(): Formatter[] {
	return [
		textPlainFormatter,
		applicationJsonFormatter,
	];
}

function getAllVariables(
	context: PlatformContext,
): Record<string, unknown | null> {
	return {};
}

function getVariable(
	context: PlatformContext,
	name: string,
): unknown | null | undefined {
	return undefined;
}

// async function input<T>(
//   context: PlatformContext,
//   payload: T,
//   options?: InputOptions,
// ): Promise<void> {
//   if (context.eventHandler === null) {
//     return;
//   }

//   const formatter = pickFormatter(getAvailableFormatters(), options);
//   const deserializedPayload =
//     ((formatter !== null) ? formatter.deserialize(payload) : payload);

//   const event: HexEnvironmentEvent = {
//     context: context,
//     type: "input",
//   };

//   await context.eventHandler(event, payload);
// }

// async function output<T>(
//   context: PlatformContext,
//   payload: T,
//   options?: OutputOptions,
// ): Promise<void> {
//   const formatter = pickFormatter(getAvailableFormatters(), options);
//   const serializedPayload =
//     await ((formatter !== null) ? formatter.serialize(payload) : payload);

//   if (options?.isError) {
//     console.error(serializedPayload);

//     return;
//   }

//   console.log(serializedPayload);
// }

// async function kill(context: PlatformContext): Promise<void> {
//   if (context.eventHandler === null) {
//     return;
//   }

//   const event: HexEnvironmentEvent = {
//     context: context,
//     type: "signkill",
//   };

//   await context.eventHandler(event);
// }

function createContext(
	eventHandler?: (
		event: Event,
		...args: unknown[]
	) => void | Promise<void>,
): PlatformContext {
	return {
		services: {},
		eventHandler: eventHandler ?? null,
	};
}

const cli: Platform = {
	getType,
	getAvailableFormatters,

	createContext,

	getAllVariables,
	getVariable,

	input,
	output,
	kill,
};

export { cli as default };
