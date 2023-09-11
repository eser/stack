import { type LayoutContext } from "$cool/lime/server.ts";
import { delay } from "$cool/lime/tests/deps.ts";

export default async function AsyncLayout(
  _req: Request,
  ctx: LayoutContext,
) {
  await delay(10);
  return (
    <div className="async-layout">
      <p>Async layout</p>
      <ctx.Component />
    </div>
  );
}