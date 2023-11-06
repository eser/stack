// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type RouteContext } from "../../../../server.ts";

export default async function AsyncPage(_req: Request, _ctx: RouteContext) {
  await new Promise((r) => setTimeout(r, 10));
  return (
    <div className="async-page">
      <p>Async page</p>
    </div>
  );
}
