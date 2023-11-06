// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type MiddlewareHandlerContext } from "../../../../../../server.ts";

export async function handler(_req: Request, ctx: MiddlewareHandlerContext) {
  ctx.state["layer3"] = "layer3_mw";
  const resp = await ctx.next();
  resp.headers.set("server", "cool lime test server layer3");
  resp.headers.set("layer3", "cool lime test server layer3");
  return resp;
}
