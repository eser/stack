import {
	composer,
	HexFunctionContext,
	HexFunctionInput,
	HexFunctionNext,
	HexFunctionResult,
	results,
	router,
} from "../../../src/functions/mod.ts";

const authMiddleware = function authMiddleware(
	input: HexFunctionInput,
	context: HexFunctionContext,
	next: HexFunctionNext,
): HexFunctionResult {
	return next();
};

const logMiddleware = async function logMiddleware(
	input: HexFunctionInput,
	context: HexFunctionContext,
	next?: HexFunctionNext,
): HexFunctionResult {
	await context.services.logger.debug(`req start - ${input.event.uri}`);

	let result;

	try {
		result = await next();

		await context.services.logger.info(`req done - ${input.event.uri}`);
	} catch (ex) {
		await context.services.logger.error(`req error - ${input.event.uri}`);
		throw ex;
	} finally {
		await context.services.logger.debug(`req end - ${input.event.uri}`);
	}

	return result;
};

const helloValidator = function helloValidator(
	input: HexFunctionInput,
	context: HexFunctionContext,
	next?: HexFunctionNext,
): HexFunctionResult {
	if (input.parameters?.name === undefined) {
		return results.preconditionFailed("input.parameters.name");
	}

	return next();
};

const helloMain = async function helloMain(
	input: HexFunctionInput,
	context: HexFunctionContext,
): HexFunctionResult {
	const message = `hello ${input.parameters.name}`;

	await context.services.logger.warn(`response ${message}`);

	return results.text(message);
};

const hello = composer(helloValidator, helloMain);

const routes = router(
	route("GET", "/hello/:name", authMiddleware, hello),
	route("GET", "/health", () => results.ok),
	route("GET", "/", () => results.text("hello from hex functions.")),
	// subrouter,
);

// routes == function (input, context, next) - so it can composable
const wrappedRoutes = composer(logMiddleware, routes);

export { wrappedRoutes as default };
