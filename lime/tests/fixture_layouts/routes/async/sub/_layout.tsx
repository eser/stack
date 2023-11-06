// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type LayoutContext } from "../../../../../server.ts";

export default async function AsyncSubLayout(
  _req: Request,
  ctx: LayoutContext,
) {
  await new Promise((r) => setTimeout(r, 10));

  return (
    <div className="async-sub-layout">
      <p>Async Sub layout</p>
      <ctx.Component />
    </div>
  );
}
