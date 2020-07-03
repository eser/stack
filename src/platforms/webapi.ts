import { log, logLevels, oak } from "./webapi.deps.ts";
import HexFunction from "../abstractions/function.ts";
import HexFunctionInput from "../abstractions/functionInput.ts";
import HexFunctionContext from "../abstractions/functionContext.ts";
import runtime from "../core/runtime.ts";

function handleRequest(target: HexFunction) {
  return async (ctx: oak.Context) => {
    const input: HexFunctionInput = {
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
      parameters: {
        ...oak.helpers.getQuery(ctx),
      },
    };

    const context: HexFunctionContext = {
      services: {},
      vars: {},
    };

    const output = await runtime(target, input, context);

    ctx.response.body = output;
  };
}

async function webapi(target: HexFunction, port: number): Promise<void> {
  const app = new oak.Application();

  app.use(handleRequest(target));

  await app.listen({ port: port });
}

export {
  webapi as default,
};
