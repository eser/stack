import { type MiddlewareHandlerContext } from "../../../../server.ts";

export async function handler(
  _req: Request,
  ctx: MiddlewareHandlerContext,
) {
  return await ctx.renderNotFound();
}
