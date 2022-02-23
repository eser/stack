import type { HexContext } from "./context.ts";
import type { HexFunctionInput } from "./functionInput.ts";

interface HexPlatform {
	// TODO(@eserozvataf) available formatters
	// TODO(@eserozvataf) syslog - debug function
	// TODO(@eserozvataf) get environment variables

	getContext: () => HexContext;
	getDefaultInput: () => HexFunctionInput;
	commitResult: (result: Promise<string>) => Promise<void>;
}

export type { HexPlatform };
