import PlatformContext from "./platform-context.ts";
import type EventType from "./event-type.ts";

interface Event {
	platformContext: PlatformContext;
	type: EventType;
	vars: Record<string, () => unknown | unknown>;
}

export type { Event as default };
