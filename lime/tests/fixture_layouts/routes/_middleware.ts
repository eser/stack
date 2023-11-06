// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type MiddlewareHandlerContext } from "../../../server.ts";

export type LayoutState = {
  something: string;
};

export const handler = (
  _req: Request,
  ctx: MiddlewareHandlerContext<LayoutState>,
) => {
  ctx.state.something = "it works";
  return ctx.next();
};
