import { log } from "../deps.ts";

const timerMiddleware = () => {
  // deno-lint-ignore no-explicit-any
  const timerMiddlewareFn = async (ctx: any, next: any) => {
    const start = Date.now();

    await next();

    const ms = Date.now() - start;

    // ctx.response.headers.set("X-Response-Time", `${ms}ms`);
    log.info(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
  };

  return timerMiddlewareFn;
};

export { timerMiddleware, timerMiddleware as default };
