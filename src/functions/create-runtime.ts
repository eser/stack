import type HexEnvironment from "../environment/environment.ts";
import type HexEnvironmentPlatformContext from "../environment/platform-context.ts";
import type HexFunction from "./function.ts";
import type HexFunctionContext from "./function-context.ts";
import type HexFunctionInput from "./function-input.ts";
import type HexFunctionResult from "./function-result.ts";
import type HexRuntime from "./runtime.ts";

const getDefaultInput = function getDefaultInput(): HexFunctionInput {
	return {
		platform: {
			type: "cli",
			name: "",
		},
		event: {
			name: "Command",
		},
		requestedFormat: {
			mimetype: "",
			format: "",
		},
		parameters: {
			...Deno.args,
		},
	};

	// {
	//   platform: {
	//     type: "web",
	//     name: "",
	//   },
	//   event: {
	//     name: "Request",
	//   },
	//   requestedFormat: {
	//     mimetype: "",
	//     format: "",
	//   },
	//   parameters: {},
	// }
};

const execute = function execute(
	environment: HexEnvironment,
	context: HexFunctionContext,
	target: HexFunction,
	input?: HexFunctionInput,
): Promise<void> {
	const result: HexFunctionResult = target(
		input ?? getDefaultInput(),
		context,
	);

	return environment.output(context, result);
};

const createContext = function createContext(
	environment: HexEnvironment,
): HexFunctionContext {
	const environmentContext: HexEnvironmentPlatformContext = environment
		.createContext(); // environmentHandler

	return environmentContext as HexFunctionContext;
};

const createRuntime = function createRuntime(
	environment: HexEnvironment,
	options: Record<string, unknown> = {},
): HexRuntime {
	const context = createContext(environment); // environmentHandler

	// function environmentHandler(event: HexEnvironmentEvent, ...args: unknown[]) {
	//   if (event === HexEnvironmentEvent.Input) {
	//     // execute();
	//   }
	// }

	return {
		context: context,
		options: options,
		execute: (target: HexFunction, input?: HexFunctionInput): Promise<void> =>
			execute(environment, context, target, input),
	};
};

export { createRuntime, createRuntime as default };
