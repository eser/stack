import { log, oak } from "../deps.ts";
import { type Service, type ServiceOptions } from "../types.ts";

const fixErrorObjectResult = (err: Error) => {
  const serialized = JSON.stringify(err, Object.getOwnPropertyNames(err));

  return JSON.parse(serialized);
};

export const errorHandlerMiddleware = <TOptions extends ServiceOptions>(
  service: Service<TOptions>,
) => {
  // deno-lint-ignore no-explicit-any
  const errorHandlerMiddlewareFn = async (ctx: any, next: any) => {
    try {
      await next();
    } catch (err) {
      log.error(err);

      if (oak.isHttpError(err)) {
        ctx.response.status = err.status;
      } else {
        ctx.response.status = 500;
      }

      if (service.options.envName === "production") {
        ctx.response.body = { error: err.message };
      } else {
        ctx.response.body = {
          error: err.message,
          details: fixErrorObjectResult(err),
        };
      }
      ctx.response.type = "json";
    }
  };

  return errorHandlerMiddlewareFn;
};

export { errorHandlerMiddleware as default };
