import { log } from "../deps.ts";

// deno-lint-ignore no-explicit-any
const timerMiddleware = async (ctx: any, next: any) => {
  const start = Date.now();

  await next();

  const ms = Date.now() - start;

  // ctx.response.headers.set("X-Response-Time", `${ms}ms`);
  log.info(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
};

export { timerMiddleware, timerMiddleware as default };
