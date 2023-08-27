import { MiddlewareHandlerContext } from "$cool/lime/server.ts";

export const handler = (_req: Request, ctx: MiddlewareHandlerContext) => {
  ctx.state.handler2 = "it works";
  return ctx.next();
};
