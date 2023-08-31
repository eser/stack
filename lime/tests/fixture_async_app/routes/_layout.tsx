import { type LayoutContext } from "$cool/lime/server.ts";
import { delay } from "$std/async/delay.ts";

export default async function AsyncLayout(
  _req: Request,
  ctx: LayoutContext,
) {
  await delay(10);
  return (
    <div className="layout">
      <p>Async layout</p>
      <ctx.Component />
    </div>
  );
}
