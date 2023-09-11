import { type LayoutContext } from "$cool/lime/server.ts";
import { delay } from "$std/async/mod.ts";

export default async function AsyncSubLayout(
  _req: Request,
  _ctx: LayoutContext,
) {
  await delay(10);

  return new Response(null, {
    status: 307,
    headers: { Location: "/async/sub" },
  });
}
