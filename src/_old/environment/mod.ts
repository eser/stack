import type Event from "./event.ts";
import type EventType from "./event-type.ts";
import type PlatformContext from "./platform-context.ts";
import PlatformType from "./platform-type.ts";

import getType from "./get-type.ts";
import getAvailableFormatters from "./get-available-formatters.ts";
import getAllVariables from "./get-all-variables.ts";
import getVariable from "./get-variable.ts";
import consoleOutput from "./console-output.ts";
import consoleOutputError from "./console-output-error.ts";
import response from "./response.ts";
import responseError from "./response-error.ts";
import dispatch from "./dispatch.ts";

import * as platforms from "./platforms/mod.ts";

export type { Event, EventType, PlatformContext };
export {
	consoleOutput,
	consoleOutputError,
	dispatch,
	getAllVariables,
	getAvailableFormatters,
	getType,
	getVariable,
	platforms,
	PlatformType,
	response,
	responseError,
};
