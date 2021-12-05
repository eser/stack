interface HexFunctionResultBody {
	error?: Error;
	payload?: unknown;
}

type HexFunctionResult = Promise<HexFunctionResultBody | void> | void;

export type { HexFunctionResult };
