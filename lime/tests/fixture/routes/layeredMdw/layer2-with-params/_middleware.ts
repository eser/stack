import { type MiddlewareHandlerContext } from "$cool/lime/server.ts";

export async function handler(_req: Request, ctx: MiddlewareHandlerContext) {
  const resp = await ctx.next();
  resp.headers.set("middlewareParams_outer", JSON.stringify(ctx.params));
  return resp;
}
