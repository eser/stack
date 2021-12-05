import { log, logLevels, oak } from "./webapi.deps.ts";
import type { HexContext } from "../abstractions/context.ts";
import type { HexFunctionInput } from "../abstractions/functionInput.ts";
import type { HexPlatform } from "../abstractions/platform.ts";

function getContext(): HexContext {
	return {
		services: {},
		vars: {},
	};
}

function getDefaultInput(): HexFunctionInput {
	return {
		platform: {
			type: "web",
			name: "",
		},
		event: {
			name: "Request",
		},
		requestedFormat: {
			mimetype: "",
			format: "",
		},
		parameters: {},
	};
}

async function commitResult(result: Promise<string>): Promise<void> {
	console.log(await result);
}

// function handleRequest(target: HexFunction) {
//   return async (ctx: oak.Context) => {
//     const input: HexFunctionInput = {
//       platform: {
//         type: "web",
//         name: "",
//       },
//       event: {
//         name: "Request",
//       },
//       requestedFormat: {
//         mimetype: "",
//         format: "",
//       },
//       parameters: {
//         ...oak.helpers.getQuery(ctx),
//       },
//     };

//     const context: HexContext = {
//       services: {},
//       vars: {},
//     };

//     const output = await runtime(target, input, context);

//     ctx.response.body = output;
//   };
// }

// async function webapi(target: HexFunction, port: number): Promise<void> {
//   const app = new oak.Application();

//   app.use(handleRequest(target));

//   await app.listen({ port: port });
// }

const webapi: HexPlatform = {
	getContext,
	getDefaultInput,
	commitResult,
};

export { webapi };
