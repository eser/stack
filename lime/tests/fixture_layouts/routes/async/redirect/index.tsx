import { type RouteContext } from "../../../../../server.ts";

export default async function AsyncRedirectPage(
  _req: Request,
  _ctx: RouteContext,
) {
  await new Promise((r) => setTimeout(r, 10));
  return (
    <div className="async-sub-page">
      <p>Async Redirect page</p>
    </div>
  );
}
