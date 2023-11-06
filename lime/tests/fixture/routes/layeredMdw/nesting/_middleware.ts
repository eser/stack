// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type MiddlewareHandlerContext } from "../../../../../server.ts";

export async function handler(_req: Request, ctx: MiddlewareHandlerContext) {
  ctx.state["middlewareNestingOrder"] = "1";
  const resp = await ctx.next();
  return resp;
}
