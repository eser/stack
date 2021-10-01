import type Formatter from "../../formatter.ts";
import HexEnvironmentEvent from "../environment-event.ts";
import type HexEnvironmentEventType from "../environment-event-type.ts";
import PlatformType from "../platform-type.ts";
import type PlatformContext from "../platform-context.ts";
import type InputOptions from "../input-options.ts";
import type OutputOptions from "../output-options.ts";
import textPlainFormatter from "../../formatters/text-plain.ts";
import applicationJsonFormatter from "../../formatters/application-json.ts";
import pickFormatter from "../pick-formatter.ts";

import { log, logLevels, oak } from "./webapi.deps.ts";

function getType(): PlatformType {
  return PlatformType.Runtime;
}

function getAvailableFormatters(): Formatter[] {
  return [
    textPlainFormatter,
    applicationJsonFormatter,
  ];
}

function createContext(
  eventHandler?: (
    event: HexEnvironmentEvent,
    ...args: unknown[]
  ) => void | Promise<void>,
): PlatformContext {
  return {
    services: {},
    eventHandler: eventHandler ?? null,
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

//     const context: HexFunctionContext = {
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

const webapi: Platform = {
  getContext,
  getDefaultInput,
  commitResult,
};

export { webapi as default };
