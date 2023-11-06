// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type MiddlewareHandlerContext } from "../../../../server.ts";

export const handler = (_req: Request, ctx: MiddlewareHandlerContext) => {
  ctx.state = { handler1: "it works" };
  return ctx.next();
};
