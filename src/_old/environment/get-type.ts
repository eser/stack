import type PlatformContext from "./platform-context.ts";
import PlatformType from "./platform-type.ts";

function getType(context: PlatformContext): PlatformType {
	return context.type;
}

export { getType as default };
