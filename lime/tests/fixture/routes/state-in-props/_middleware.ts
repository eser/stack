// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type MiddlewareHandlerContext } from "../../../../server.ts";
import { type TestState } from "../_app.tsx";

export async function handler(
  _req: Request,
  ctx: MiddlewareHandlerContext<TestState>,
) {
  ctx.state.stateInProps = "look, i am set from middleware";
  const resp = await ctx.next();
  return resp;
}
