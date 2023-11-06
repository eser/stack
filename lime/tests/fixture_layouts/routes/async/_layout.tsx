// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type LayoutContext } from "../../../../server.ts";
import { delay } from "../../../deps.ts";

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
