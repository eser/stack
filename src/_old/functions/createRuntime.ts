import type { HexFormatter } from "./abstractions/formatter.ts";
import type { HexFunction } from "./abstractions/function.ts";
import type { HexFunctionInput } from "./abstractions/functionInput.ts";
import type { HexFunctionResult } from "./abstractions/functionResult.ts";
import type { HexPlatform } from "./abstractions/platform.ts";
import type { HexRuntime } from "./abstractions/runtime.ts";
import { formatter as textPlainFormatter } from "./formatters/text-plain.ts";

function pickProperFormatter(): HexFormatter {
	// TODO(@eserozvataf) for now there's only text/plain formatter
	return textPlainFormatter;
}

function createRuntime(
	platform: HexPlatform,
	options?: Record<string, unknown>,
): HexRuntime {
	function execute(
		target: HexFunction,
		input?: HexFunctionInput,
	): Promise<void> {
		const result: HexFunctionResult = target(
			input ?? platform.getDefaultInput(),
			platform.getContext(),
		);

		const formatter: HexFormatter = pickProperFormatter();
		const formattedResult: Promise<string> = formatter(result);

		return platform.commitResult(formattedResult);
	}

	return {
		platform: platform,
		options: options,
		execute: execute,
	};
}

export { createRuntime };
