import { MiddlewareHandlerContext } from "$cool/lime/server.ts";
import { TestState } from "../_app.tsx";

export async function handler(
  _req: Request,
  ctx: MiddlewareHandlerContext<TestState>,
) {
  ctx.state.stateInProps = "look, i am set from middleware";
  const resp = await ctx.next();
  return resp;
}
