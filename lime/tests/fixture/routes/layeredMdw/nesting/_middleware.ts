import { type MiddlewareHandlerContext } from "$cool/lime/server.ts";

export async function handler(_req: Request, ctx: MiddlewareHandlerContext) {
  ctx.state.middlewareNestingOrder = "1";
  const resp = await ctx.next();
  return resp;
}
