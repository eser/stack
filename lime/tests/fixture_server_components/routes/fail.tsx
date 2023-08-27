import { RouteContext } from "$cool/lime/server.ts";

// deno-lint-ignore require-await
export default async function Home(_req: Request, ctx: RouteContext) {
  return ctx.renderNotFound();
}
